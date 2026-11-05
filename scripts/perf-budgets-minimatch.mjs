/** Minimal glob: supports *, **, and exact names. No braces. MIT-style tiny helper. */
export function minimatch(name, pattern) {
  if (pattern === name) return true;
  // escape regex specials except *
  const re = new RegExp(
    "^" +
      pattern
        .split("*")
        .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
  );
  return re.test(name);
}
