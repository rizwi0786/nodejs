import type { ModuleContent } from '../../../types';
import buffers from './buffers';
import streamsBasics from './streams-basics';
import streamsFlow from './streams-flow';
import events from './events';
import fileStreaming from './file-streaming';

const content = {
  ...buffers,
  ...streamsBasics,
  ...streamsFlow,
  ...events,
  ...fileStreaming,
} as ModuleContent;

export default content;
