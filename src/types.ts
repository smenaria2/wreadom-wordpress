// Simplified types for the import utility

export interface Author {
  name: string;
  birth_year: number | null;
  death_year: number | null;
}

export interface Chapter {
  id: string;
  title: string;
  content: string; // HTML content
  index: number;
  status?: 'published' | 'draft';
}

export interface Book {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  authors: Author[];
  subjects: string[];
  languages: string[];
  formats: { [key: string]: string };
  download_count: number;
  media_type: string;
  bookshelves: string[];
  year?: number | string;
  source?: 'archive' | 'local' | 'firestore';
  
  isOriginal?: boolean;
  contentType?: 'story' | 'poem' | 'article';
  authorId?: string;
  chapters?: Chapter[];
  status?: 'draft' | 'published';
  createdAt?: number;
  updatedAt?: number;
}
