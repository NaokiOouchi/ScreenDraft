export interface CapturedResource { url: string; mime: string; base64: string }
export interface CapturedStylesheet { url: string; css: string | null; media?: string }
export interface Capture {
  schemaVersion: 1;
  title: string;
  sourceUrl: string;
  baseUrl: string;
  viewport: { width: number; height: number };
  html: string;
  stylesheets: CapturedStylesheet[];
  resourceUrls: string[];
  resources: CapturedResource[];
  warnings: string[];
  capturedAt: string;
}
export interface Proposal { id: string; title: string; createdAt: string; updatedAt: string; headRevisionId: string | null }
export interface Screen {
  id: string; proposalId: string; title: string; sourceUrl: string;
  snapshotId: string; width: number; height: number; createdAt: string;
  assetCount: number; warnings: string[]; captureIssuesReviewed?: boolean;
}
export interface ProposalSummary extends Proposal {screenCount:number;pendingCount:number;runningCount:number}
export interface ProposalDetail { proposal: Proposal; screens: Screen[] }
export interface Revision { id:string;proposalId:string;parentId:string|null;createdAt:string;reason:string;version:number;screenCount:number }
export interface RevisionDetail { revision:Revision;screens:Screen[] }

export interface TrashDetail {proposals:(Proposal & {deletedAt:string})[];screens:(Screen & {deletedAt:string;proposalTitle:string})[]}
