import type { InterviewQuestion } from '../../../types';
import { dedent } from '../../content/helpers';

/** Authoring shape for an output question: code fields are flattened, kind/code id are filled in. */
export interface OutputSpec extends Omit<InterviewQuestion, 'kind' | 'code'> {
  code: string;
  expectedOutput: string;
  /** Pure JS that runs in the sandbox. Leave unset for Node-only code. */
  runnable?: boolean;
  versionNote?: string;
}

export function out(s: OutputSpec): InterviewQuestion {
  const { code, expectedOutput, runnable, versionNote, ...rest } = s;
  return {
    ...rest,
    kind: 'output',
    code: {
      id: `${s.id}-code`,
      language: 'javascript',
      code: dedent(code),
      expectedOutput: dedent(expectedOutput),
      ...(runnable ? { runnable: true } : {}),
      ...(versionNote ? { versionNote } : {}),
    },
  };
}
