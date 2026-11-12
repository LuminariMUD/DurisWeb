import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { ESLint } from 'eslint';

// The lint guard from #176 must keep rejecting the leak forms it was written for.
const backendRoot = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: backendRoot });

async function restrictedSyntaxMessages(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: 'src/routes/guardFixture.ts' });
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
}

describe('error response lint guard', () => {
  it('rejects error text sent to a client', async () => {
    const messages = await restrictedSyntaxMessages(
      'export const f = (res: any, error: unknown) => res.status(500).json({ error: getErrorMessage(error) });\ndeclare function getErrorMessage(e: unknown): string;\n',
    );
    expect(messages).toEqual([
      'Do not send error text to clients; use sendRouteError or AppError.',
    ]);
  });

  it('rejects picking raw error text in route code', async () => {
    const messages = await restrictedSyntaxMessages(
      "export const f = (error: unknown) => (error instanceof Error ? error.message : 'x');\n",
    );
    expect(messages).toHaveLength(1);
  });

  it('accepts the helper', async () => {
    const messages = await restrictedSyntaxMessages(
      "export const f = (res: any, error: unknown) => sendRouteError(res, error, 'Failed', 'Failed');\ndeclare function sendRouteError(...args: unknown[]): unknown;\n",
    );
    expect(messages).toEqual([]);
  });
});
