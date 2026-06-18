// BUG: subtracts instead of adding. The agent's job is to fix this so the test passes.
export function add(a: number, b: number): number {
  return a - b;
}
