import type { EditJob } from '../shared/editor-types.js';
import type { Proposal, ProposalSummary, ProposalDetail, Screen, Revision, RevisionDetail, TrashDetail } from '../shared/types.js';

// Local persistence boundary, including revisions and edit jobs.
export type Stored<T> = T;
export interface Repository {
  renameProposal(id:string,title:string): Proposal;
  trashProposal(id:string): void;
  restoreProposal(id:string): Proposal;
  renameScreen(proposalId:string,screenId:string,title:string): ProposalDetail;
  trashScreen(proposalId:string,screenId:string): ProposalDetail;
  restoreScreen(proposalId:string,screenId:string): ProposalDetail;
  restoreHistoryScreen(proposalId:string,screenId:string,revisionId:string,baseSnapshotId:string):ProposalDetail;
  updateScreen(proposalId:string,screenId:string,baseSnapshotId:string,input:Omit<Screen,'id'|'proposalId'|'createdAt'>,html:string,assets:{id:string;mime:string;size:number}[],importKey?:{id:string;fingerprint:string}):Screen;
  trash(): TrashDetail;
  list(): Stored<ProposalSummary[]>;
  create(title: string): Stored<Proposal>;
  detail(id: string): Stored<ProposalDetail | undefined>;
  revisions(proposalId: string): Stored<Revision[]>;
  revision(proposalId: string, revisionId: string): Stored<RevisionDetail | undefined>;
  addScreen(proposalId: string, input: Omit<Screen, 'id' | 'proposalId' | 'createdAt'>, html: string, assets: {id: string; mime: string; size: number}[], importKey?: {id:string;fingerprint:string}): Stored<Screen>;
  importedScreen(proposalId:string, importId:string): Stored<{screen:Screen;fingerprint:string}|undefined>;
  snapshot(id: string): Stored<{html: string} | undefined>;
  asset(id: string): Stored<{mime: string} | undefined>;
  createJob(job: EditJob): Stored<EditJob>;
  job(id: string): Stored<EditJob | undefined>;
  jobs(proposalId: string): Stored<EditJob[]>;
  updateJob(id: string, patch: Partial<Pick<EditJob, 'status' | 'summary' | 'candidateSnapshotId' | 'error'>>): Stored<EditJob>;
  storeSnapshot(html: string): Stored<string>;
  interruptJobs(): Stored<void>;
  acceptJob(id: string): Stored<ProposalDetail>;
  close(): Stored<void>;
}
