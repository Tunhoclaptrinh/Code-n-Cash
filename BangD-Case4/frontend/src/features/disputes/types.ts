export type DisputeStatus = 'OPEN' | 'AWAITING_EVIDENCE' | 'RESOLVED';

export type ResolutionOption = 'ACCEPT_WAIVE_PENALTY' | 'KEEP_PENALTY' | 'REQUEST_MORE_EVIDENCE';

export type MilestoneKind = 'SIGNING' | 'DELIVERY' | 'ACCEPTANCE' | 'WARRANTY';

export type DisputeEventKind = 'OPENED' | ResolutionOption;

export interface DisputeEvidence {
  id: string;
  fileName: string;
  kind: 'PDF' | 'DOCX' | 'IMAGE';
}

export interface DisputeEvent {
  kind: DisputeEventKind;
  at: string;
  actorName: string;
}

export interface DisputeResolution {
  option: ResolutionOption;
  note: string;
  decidedAt: string;
  decidedBy: string;
}

export interface Dispute {
  contractCode: string;
  milestoneNo: number;
  milestoneKind: MilestoneKind;
  status: DisputeStatus;
  raisedBy: {
    name: string;
    organizationName: string;
    /** Two letters shown in the avatar bubble. */
    initials: string;
  };
  raisedAt: string;
  /** Free text written by the supplier. */
  message: string;
  evidence: DisputeEvidence[];
  /** What the milestone would pay, in millions of VND, under each of the two outcomes. */
  impact: {
    keepPenaltyMillion: number;
    waivePenaltyMillion: number;
  };
  /** Reason the contract owner has already typed but not yet submitted. */
  draftNote: string;
  timeline: DisputeEvent[];
  resolution?: DisputeResolution;
}

export interface ResolveDisputeInput {
  contractCode: string;
  milestoneNo: number;
  option: ResolutionOption;
  note: string;
  actor: { id: string; displayName: string };
}
