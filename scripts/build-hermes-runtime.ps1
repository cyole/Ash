param(
    [string]$OutDir = $(if ($env:HERMES_RUNTIME_OUT_DIR) { $env:HERMES_RUNTIME_OUT_DIR } else { Join-Path (Split-Path $PSScriptRoot -Parent) "src-tauri\resources\hermes-runtime" }),
    [string]$ExpectedCommit = $(if ($env:HERMES_AGENT_COMMIT) { $env:HERMES_AGENT_COMMIT } else { "343c54e35bfe8682dcf597aea1f0ea5278864156" }),
    [string]$HermesRef = $(if ($env:HERMES_AGENT_REF) { $env:HERMES_AGENT_REF } else { "main" }),
    [string]$InstallerRef = $(if ($env:HERMES_INSTALLER_REF) { $env:HERMES_INSTALLER_REF } elseif ($ExpectedCommit) { $ExpectedCommit } else { "main" }),
    [string]$InstallerUrl = $(if ($env:HERMES_INSTALLER_URL) { $env:HERMES_INSTALLER_URL } else { "https://raw.githubusercontent.com/NousResearch/hermes-agent/$InstallerRef/scripts/install.ps1" }),
    [string]$BuildRoot = $(if ($env:HERMES_RUNTIME_BUILD_ROOT) { $env:HERMES_RUNTIME_BUILD_ROOT } else { Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-runtime-build." + [System.Guid]::NewGuid().ToString("N")) }),
    [switch]$KeepBuild,
    [switch]$SkipValidation
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Get-RuntimeArch {
    $override = $env:HERMES_RUNTIME_ARCH
    if ($override) { return $override }

    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    switch ($arch) {
        "X64" { return "x64" }
        "Arm64" { return "arm64" }
        default { throw "Unsupported Windows architecture: $arch" }
    }
}

function Remove-TreeIfExists {
    param([string]$Path)
    if (Test-Path $Path) {
        Remove-Item -Recurse -Force $Path
    }
}

function Remove-RuntimeCaches {
    param([string]$Root)

    Get-ChildItem -Path $Root -Recurse -Directory -Force -Filter "__pycache__" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $Root -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -like "*.pyc" -or
            $_.Name -like "*.pyo" -or
            $_.Name -eq ".DS_Store" -or
            $_.Name -like "._*"
        } |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

function Prune-StagedRuntime {
    param([string]$RuntimeDir)

    $relativePaths = @(
        ".agents",
        ".dockerignore",
        ".git",
        ".gitattributes",
        ".github",
        ".gitignore",
        ".hadolint.yaml",
        ".plans",
        "docker",
        "Dockerfile",
        "docker-compose.yml",
        "docker-compose.windows.yml",
        "docs",
        "datagen-config-examples",
        "flake.lock",
        "flake.nix",
        "infographic",
        "nix",
        "node_modules",
        "packaging",
        "plans",
        "tests",
        "ui-tui",
        "web",
        "website"
    )

    foreach ($relativePath in $relativePaths) {
        Remove-TreeIfExists (Join-Path $RuntimeDir $relativePath)
    }

    Get-ChildItem -Path $RuntimeDir -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -eq "node_modules" -or
            $_.Name -eq ".pytest_cache" -or
            $_.Name -eq ".ruff_cache" -or
            $_.Name -eq ".agents" -or
            ($_.Name -eq "dist" -and $_.FullName -like "*\dashboard\*")
        } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    Remove-RuntimeCaches $RuntimeDir
}

function Write-RelocatableLaunchers {
    param([string]$RuntimeDir)

    $scriptsDir = Join-Path $RuntimeDir "venv\Scripts"
    New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null

    Remove-Item -Force -ErrorAction SilentlyContinue `
        (Join-Path $scriptsDir "hermes.exe"),
        (Join-Path $scriptsDir "hermes-script.py")

    $cmdPath = Join-Path $scriptsDir "hermes.cmd"
    Set-Content -Path $cmdPath -Encoding ASCII -Value @(
        "@echo off",
        "setlocal",
        "set `"ROOT=%~dp0..\..`"",
        "set `"PYTHONPATH=%ROOT%;%ROOT%\venv\Lib\site-packages;%PYTHONPATH%`"",
        "`"%ROOT%\python\runtime\python.exe`" -m hermes_cli.main %*"
    )

    $psPath = Join-Path $scriptsDir "hermes.ps1"
    Set-Content -Path $psPath -Encoding ASCII -Value @(
        '$ErrorActionPreference = "Stop"',
        '$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")',
        '$sitePackages = Join-Path $root "venv\Lib\site-packages"',
        '$env:PYTHONPATH = "$root;$sitePackages;$env:PYTHONPATH"',
        '& (Join-Path $root "python\runtime\python.exe") -m hermes_cli.main @args',
        'exit $LASTEXITCODE'
    )
}

function Copy-PythonRuntime {
    param([string]$RuntimeDir)

    $pythonExe = Join-Path $RuntimeDir "venv\Scripts\python.exe"
    if (-not (Test-Path $pythonExe)) {
        throw "Could not find venv Python at $pythonExe"
    }

    $basePrefix = (& $pythonExe -c "import sys; print(sys.base_prefix)") -join ""
    if (-not (Test-Path $basePrefix)) {
        throw "Could not find uv-managed CPython runtime at $basePrefix"
    }

    $pythonDir = Join-Path $RuntimeDir "python"
    New-Item -ItemType Directory -Force -Path $pythonDir | Out-Null
    $runtimeName = "runtime"
    $stagedBasePrefix = Join-Path $pythonDir $runtimeName
    Remove-TreeIfExists $stagedBasePrefix
    Copy-Item -Recurse -Force $basePrefix $stagedBasePrefix
    Remove-RuntimeCaches $stagedBasePrefix

    $pyvenvCfg = Join-Path $RuntimeDir "venv\pyvenv.cfg"
    $relativeHome = "..\..\python\$runtimeName"
    $cfg = Get-Content -Path $pyvenvCfg -ErrorAction Stop
    $updated = $cfg | ForEach-Object {
        if ($_ -match "^\s*home\s*=") {
            "home = $relativeHome"
        } else {
            $_
        }
    }
    Set-Content -Path $pyvenvCfg -Encoding ASCII -Value $updated
}

function Test-StagedRuntime {
    param([string]$RuntimeDir)

    $pythonExe = Join-Path $RuntimeDir "python\runtime\python.exe"
    if (-not (Test-Path $pythonExe)) {
        throw "Could not find staged Python runtime at $pythonExe"
    }
    $previousPythonPath = $env:PYTHONPATH
    $env:PYTHONPATH = "$RuntimeDir;$(Join-Path $RuntimeDir "venv\Lib\site-packages");$previousPythonPath"
    try {
        $output = & $pythonExe -m hermes_cli.main --version
        if ($LASTEXITCODE -ne 0) {
            throw "Staged Hermes runtime failed --version validation"
        }
        return (($output | Select-Object -First 1) -as [string])
    } finally {
        $env:PYTHONPATH = $previousPythonPath
    }
}

function Assert-CleanRuntime {
    param([string]$RuntimeDir)

    $disallowedPaths = @(
        ".git",
        ".github",
        ".plans",
        "docker",
        "Dockerfile",
        "docker-compose.yml",
        "docker-compose.windows.yml",
        "node_modules",
        "packaging",
        "plans",
        "tests",
        "ui-tui",
        "web",
        "website"
    )

    foreach ($relativePath in $disallowedPaths) {
        $path = Join-Path $RuntimeDir $relativePath
        if (Test-Path $path) {
            throw "Disallowed runtime path remains: $relativePath"
        }
    }

    $cacheHit = Get-ChildItem -Path $RuntimeDir -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -eq "__pycache__" -or
            $_.Name -eq "node_modules" -or
            $_.Name -eq ".pytest_cache" -or
            $_.Name -eq ".ruff_cache" -or
            $_.Name -like "*.pyc" -or
            $_.Name -like "*.pyo" -or
            $_.Name -eq ".DS_Store" -or
            $_.Name -like "._*"
        } |
        Select-Object -First 1

    if ($cacheHit) {
        throw "Disallowed cache path remains: $($cacheHit.FullName)"
    }
}

$platform = if ($env:HERMES_RUNTIME_PLATFORM) { $env:HERMES_RUNTIME_PLATFORM } else { "windows" }
if ($platform -ne "windows") {
    throw "This script builds Windows runtime bundles only."
}

$arch = Get-RuntimeArch
$archiveName = "hermes-runtime-$platform-$arch.tar.gz"
$archivePath = Join-Path $OutDir $archiveName
$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("hermes-runtime-stage." + [System.Guid]::NewGuid().ToString("N"))
$homeDir = Join-Path $BuildRoot "home"
$hermesHome = Join-Path $BuildRoot "hermes-home"
$installDir = Join-Path $BuildRoot "hermes-agent"
$uvPythonDir = Join-Path $BuildRoot "uv\python"
$uvBinDir = Join-Path $BuildRoot "uv\bin"
$cacheDir = Join-Path $BuildRoot "cache"

if ($env:HERMES_RUNTIME_KEEP_BUILD -eq "1") {
    $KeepBuild = $true
}

Write-Host "Building Hermes runtime"
Write-Host "  ref:     $HermesRef"
Write-Host "  commit:  $ExpectedCommit"
Write-Host "  target:  $platform-$arch"
Write-Host "  build:   $BuildRoot"
Write-Host "  output:  $archivePath"
Write-Host ""

New-Item -ItemType Directory -Force -Path $OutDir, $BuildRoot, $stageRoot, $homeDir, $hermesHome, $uvPythonDir, $uvBinDir, $cacheDir | Out-Null

$env:HOME = $homeDir
$env:HERMES_HOME = $hermesHome
$env:UV_PYTHON_INSTALL_DIR = $uvPythonDir
$env:UV_PYTHON_BIN_DIR = $uvBinDir
$env:UV_CACHE_DIR = $cacheDir

if (Get-Command git -ErrorAction SilentlyContinue) {
    & git config --global core.longpaths true
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to enable Git long paths for Windows runtime packaging."
    }
    & git config --global core.autocrlf false
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to disable Git autocrlf for Windows runtime packaging."
    }
    & git config --global core.eol lf
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set Git line endings for Windows runtime packaging."
    }
}

$installerPath = Join-Path $BuildRoot "install.ps1"
Invoke-WebRequest -Uri $InstallerUrl -OutFile $installerPath -UseBasicParsing

$stageNames = @("uv", "python", "git", "repository", "venv", "dependencies", "platform-sdks")
foreach ($stageName in $stageNames) {
    Write-Host "Running installer stage: $stageName"
    & pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File $installerPath `
        -Stage $stageName `
        -Json `
        -NonInteractive `
        -SkipSetup `
        -Branch $HermesRef `
        -Commit $ExpectedCommit `
        -HermesHome $hermesHome `
        -InstallDir $installDir
    if ($LASTEXITCODE -ne 0) {
        throw "Installer stage failed: $stageName"
    }
}

$actualCommit = (& git -C $installDir rev-parse HEAD) -join ""
if ($LASTEXITCODE -ne 0) {
    throw "Could not read Hermes Agent commit from $installDir"
}
if ($ExpectedCommit -and $actualCommit -ne $ExpectedCommit) {
    throw "Hermes Agent commit mismatch. Expected $ExpectedCommit, got $actualCommit"
}

$stagedAgent = Join-Path $stageRoot "hermes-agent"
Copy-Item -Recurse -Force $installDir $stagedAgent
Prune-StagedRuntime $stagedAgent
Copy-PythonRuntime $stagedAgent
Write-RelocatableLaunchers $stagedAgent
Remove-RuntimeCaches $stagedAgent

$versionLine = Test-StagedRuntime $stagedAgent
Remove-RuntimeCaches $stagedAgent

$manifest = [ordered]@{
    hermesAgentRef = $HermesRef
    hermesAgentCommit = $actualCommit
    installerUrl = $InstallerUrl
    installerRef = $InstallerRef
    platform = $platform
    arch = $arch
    profile = "minimal"
    version = $versionLine
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $stagedAgent "runtime-build-manifest.json") -Encoding ASCII

if (-not $SkipValidation -and $env:HERMES_RUNTIME_VALIDATE -ne "0") {
    Write-Host "Validating staged runtime..."
    Assert-CleanRuntime $stagedAgent
}

$tmpArchive = "$archivePath.tmp"
Remove-Item -Force -ErrorAction SilentlyContinue $tmpArchive, $archivePath
Push-Location $stageRoot
try {
    tar -czf $tmpArchive "hermes-agent"
    if ($LASTEXITCODE -ne 0) {
        throw "tar failed while writing $tmpArchive"
    }
} finally {
    Pop-Location
}
Move-Item -Force $tmpArchive $archivePath

Write-Host "Wrote $archivePath"
Get-Item $archivePath | Select-Object FullName, Length

Remove-TreeIfExists $stageRoot
if (-not $KeepBuild -and -not $env:HERMES_RUNTIME_BUILD_ROOT) {
    Remove-TreeIfExists $BuildRoot
} else {
    Write-Host "Kept build root: $BuildRoot"
}
