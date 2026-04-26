// Deliberately too-complex function used by the colocated test to verify that
// the ESLint sonarjs/cognitive-complexity rule fires. This file is excluded
// from the project's regular lint pass via the `**/*.fixture.ts` ignore in
// eslint.config.js — but the test bypasses ignore via `ignore: false`, so the
// rule still fires there.

export function deliberatelyComplex(input: number): string {
  let result = "";
  for (let i = 0; i < input; i++) {
    if (i % 2 === 0) {
      if (i % 3 === 0) {
        if (i % 5 === 0) {
          result += "fizzbuzz";
        } else if (i % 7 === 0) {
          result += "fizzheaven";
        } else {
          result += "fizz";
        }
      } else if (i % 5 === 0) {
        if (i % 7 === 0) {
          result += "buzzheaven";
        } else {
          result += "buzz";
        }
      } else if (i % 11 === 0) {
        for (let j = 0; j < 3; j++) {
          if (j === 0) result += "a";
          else if (j === 1) result += "b";
          else result += "c";
        }
      } else {
        result += String(i);
      }
    } else if (i % 13 === 0) {
      result += "thirteen";
    } else {
      result += "-";
    }
  }
  return result;
}
