export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  const fallback = String(error);
  if (fallback !== "[object Object]") {
    return fallback;
  }

  try {
    return JSON.stringify(error) ?? fallback;
  } catch {
    return fallback;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
