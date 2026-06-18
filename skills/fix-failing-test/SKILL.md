# Fix a failing test

Procedural knowledge for the Phase-1 job type: a repository has a failing test; make the
test suite pass without weakening the test.

## Approach

1. **Reproduce first.** Run the test command from the job's acceptance criteria (e.g. `bun test`
   or `npm test`) and read the actual failure — assertion message, stack trace, and the file/line.
   Do not guess before you have seen the real output.

2. **Localize.** Open the failing test to learn the *intended* behavior, then open the
   implementation under test. The bug is almost always in the implementation, not the test.

3. **Form one hypothesis.** State, in one sentence, why the implementation produces the wrong
   result. Make the smallest change that addresses that cause.

4. **Re-run and verify.** Run the same test command again. Iterate only on evidence from the
   output; never declare success without a green run.

5. **Do no harm.** Keep the change minimal. Do not edit the test to make it pass, delete
   assertions, skip the test, or change unrelated code. Do not loosen the spec the test encodes.

## Guardrails

- The verification gate runs the acceptance command; "done" means it exits 0 — your own opinion
  that it is fixed does not count.
- Prefer reading a file before editing it. Make one focused edit at a time, then re-test.
- If the test itself is genuinely wrong, stop and report rather than rewriting it silently.

See `reference/checklist.md` for a quick pre-completion checklist.
