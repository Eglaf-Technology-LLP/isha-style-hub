// Fisher-Yates - a random-looking .sort(() => Math.random() - 0.5) biases
// toward certain orderings depending on the sort algorithm's comparison
// pattern; this is the actually-uniform way to shuffle.
export function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
