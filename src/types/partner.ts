export type PartnerGrade = '전략 파트너' | '우선 파트너' | '일반 파트너' | '잠재 파트너';

export type PartnerCategory =
  | '물류·공급망'
  | 'IT·기술'
  | '금융·투자'
  | '제조·생산'
  | '유통·판매'
  | '컨설팅'
  | '기타';

export type FollowUpStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export interface FollowUpItem {
  id: string;
  content: string;
  dueDate: string;
  status: FollowUpStatus;
  assignee: string;
}

export interface Meeting {
  id: string;
  date: string;
  title: string;
  summary: string;
  followUps: FollowUpItem[];
}

export interface Partner {
  id: string;
  companyName: string;
  country: string;
  city: string;
  category: PartnerCategory;
  grade: PartnerGrade;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  assignee: string;
  lastMeetingDate: string | null;
  meetings: Meeting[];
  notes: string;
  createdAt: string;
}
