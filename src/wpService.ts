import axios from 'axios';

const WP_SITE_URL = import.meta.env.DEV ? '/wp-api' : 'https://public-api.wordpress.com';

export interface WPPost {
  id: number;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  featured_media: number;
  author: number;
  date: string;
  _embedded?: {
    author?: Array<{
      id: number;
      name: string;
      avatar_urls?: { [key: string]: string };
    }>;
    'wp:featuredmedia'?: Array<{
      source_url: string;
    }>;
  };
}

export interface WPAuth {
  username: string;
  appPassword: string;
}

export const getAuthorName = (post: WPPost): string => {
  if (post._embedded?.author?.[0]) {
    return post._embedded.author[0].name;
  }
  return `User ${post.author}`;
};

export const fetchWPPosts = async (page: number = 1, authorId?: number, auth?: WPAuth, search?: string) => {
  try {
    const params: any = {
      page,
      per_page: 20, // Smaller chunks for Load More
      _embed: 1,
    };
    if (authorId) {
      params.author = authorId;
    }
    if (search) {
      params.search = search;
    }

    const headers: any = {};
    if (auth?.username && auth?.appPassword) {
      const token = btoa(`${auth.username}:${auth.appPassword}`);
      headers['Authorization'] = `Basic ${token}`;
    }

    const response = await axios.get(`${WP_SITE_URL}/wp/v2/sites/srijansamwad.wordpress.com/posts`, {
      params,
      headers
    });

    const postsData = response.data;
    const total = parseInt(response.headers['x-wp-total'] || '0');
    const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1');
    
    let posts = [];
    if (Array.isArray(postsData)) {
      posts = postsData;
    } else if (postsData && typeof postsData === 'object' && Array.isArray(postsData.posts)) {
      posts = postsData.posts;
    }

    return { posts, total, totalPages };
  } catch (error) {
    console.error('Error fetching WP posts:', error);
    throw error;
  }
};

export const fetchAuthorsDirectly = async (auth: WPAuth) => {
  try {
    const token = btoa(`${auth.username}:${auth.appPassword}`);
    const response = await axios.get(`${WP_SITE_URL}/wp/v2/sites/srijansamwad.wordpress.com/users`, {
      params: { per_page: 100 },
      headers: { 'Authorization': `Basic ${token}` }
    });
    return response.data.map((u: any) => ({ id: u.id, name: u.name }));
  } catch (error: any) {
    console.error('Error fetching users directly:', error.response?.data || error.message);
    throw error;
  }
};

export const fetchAuthorsFromRecentPosts = async (auth?: WPAuth) => {
  try {
    const result = await fetchWPPosts(1, undefined, auth);
    const uniqueAuthors = new Map<number, { id: number; name: string }>();
    
    result.posts.forEach((post: WPPost) => {
      const name = getAuthorName(post);
      uniqueAuthors.set(post.author, { id: post.author, name });
    });
    
    return Array.from(uniqueAuthors.values());
  } catch (error: any) {
    console.error('Error discovering authors from recent posts:', error.response?.data || error.message);
    throw error;
  }
};

export const getFeaturedMediaUrl = (post: any): string | undefined => {
  if (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0]) {
    return post._embedded['wp:featuredmedia'][0].source_url;
  }
  return undefined;
};
