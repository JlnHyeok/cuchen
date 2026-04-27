export type ImageDiv = 'top' | 'bot' | 'top-inf' | 'bot-inf';
export type InspectionResult = 'OK' | 'NG';

export interface FileListQuery {
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  lotNo?: string;
  cameraId?: string;
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
  cameraId?: string;
  cameraIds?: string[];
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
  divs: ImageDiv[];
  results: InspectionResult[];
}
