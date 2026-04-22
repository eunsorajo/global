export interface MeetingMinutes {
  summary: string;
  keyPoints: string[];
  collaborationTopics: string[];
  followUps: { content: string; assignee?: string; dueDate?: string }[];
  partnerInfo: { companyName?: string; contactName?: string; country?: string };
}

export interface PartnerInsight {
  connectionPoint: string;
  suggestion: string;
  relatedPartners: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface PartnerContext {
  companyName: string;
  country: string;
  category: string;
  grade: string;
  recentMeetingSummaries: string[];
  collaborationTopics: string[];
}
