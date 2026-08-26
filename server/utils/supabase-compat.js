function isMissingColumnError(error, column) {
  if (!error || !column) return false;

  const text = [
    error.code,
    error.message,
    error.details,
    error.hint,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes(column.toLowerCase()) && (
    text.includes("schema cache") ||
    text.includes("could not find") ||
    text.includes("column") ||
    text.includes("does not exist")
  );
}

function withoutField(source, field) {
  const copy = { ...(source || {}) };
  delete copy[field];
  return copy;
}

module.exports = { isMissingColumnError, withoutField };
