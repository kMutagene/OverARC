import { prepareCurationWorkspace } from './curationWorkspace';

/** Creates the editable workspace before either curation browser and API server starts. */
export default function globalSetup() {
  prepareCurationWorkspace();
}
