export type ImageDiv = 'top' | 'bot' | 'top-inf' | 'bot-inf';
export type InspectionResult = 'OK' | 'NG';

export interface FileListQuery {
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  process?: string;
  version?: string;
  lotNo?: string;
  processId?: string;
  div?: ImageDiv;
  result?: InspectionResult;
}

export interface FileListItem {
  id: string;
  fileName: string;
  productId: string;
  div: ImageDiv;
  divs?: ImageDiv[];
  fileCount?: number;
  process?: string;
  processes?: string[];
  version?: string;
  versions?: string[];
  time: string;
  result: InspectionResult;
  threshold: number;
  thresholdMin?: number;
  thresholdMax?: number;
  prob: number;
  minProb?: number;
  minProbDiv?: ImageDiv;
  sizeBytes: number;
  lotNo?: string;
  lotNos?: string[];
  processId?: string;
  processIds?: string[];
  okCount?: number;
  ngCount?: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalData?: number;
  totalPages: number;
}

export interface FilterOptions {
  productIds: string[];
  processes: string[];
  versions: string[];
  divs: ImageDiv[];
  results: InspectionResult[];
}
