/** Append arbitrarily large collections without spreading them into call arguments. */
export function appendArrayValues<T>(target: T[], values: readonly T[]): void {
  for (const value of values) target.push(value);
}
