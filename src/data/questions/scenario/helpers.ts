import type { CodeExample, InterviewQuestion } from '../../../types';
import { dedent } from '../../content/helpers';

/** Authoring shape for a scenario question: kind and code id are filled in. */
export interface ScenarioSpec extends Omit<InterviewQuestion, 'kind' | 'code'> {
  code?: Omit<CodeExample, 'id'>;
}

export function sc(s: ScenarioSpec): InterviewQuestion {
  const { code, ...rest } = s;
  return {
    ...rest,
    kind: 'scenario',
    ...(code ? { code: { id: `${s.id}-code`, ...code, code: dedent(code.code) } } : {}),
  };
}
