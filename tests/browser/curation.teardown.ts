import { removeCurationWorkspace } from './curationWorkspace';

/** Cleans the exact temporary editable workspace after artifact-level assertions finish. */
export default function globalTeardown() {
  removeCurationWorkspace();
}
