export enum ReleaseNoteStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export interface ReleaseNoteDto {
  id: string;
  clickupTaskId: string;
  clickupTaskUrl: string | null;
  customId: string | null;
  rawTitle: string;
  rawDescription: string;
  aiGenerated: string;
  finalText: string | null;
  status: ReleaseNoteStatus;
  category: string | null;
  version: string | null;
  imageUrl: string | null;
  suggestedCapture: string | null;
  suggestedRoute: string | null;
  assigneeName: string | null;
  sprintName: string | null;
  epicName: string | null;
  releasedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApproveReleaseNoteDto {
  finalText: string;
  imageUrl?: string;
}
