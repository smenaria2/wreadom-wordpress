import { useEffect, useState, useMemo } from 'react';
import { fetchWPPosts, getFeaturedMediaUrl, getAuthorName, WPPost, fetchAuthorsFromRecentPosts, fetchAuthorsDirectly } from './wpService';
import { uploadUrlToCloudinary } from './cloudinaryService';
import { db, auth } from './firebase';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Book } from './types';
import DOMPurify from 'dompurify';

const App = () => {
  const [posts, setPosts] = useState<WPPost[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loadingAuthors, setLoadingAuthors] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');
  const [availableAuthors, setAvailableAuthors] = useState<Array<{id: number, name: string}>>([]);
  const [firestoreAuthors, setFirestoreAuthors] = useState<Array<{id: string, name: string}>>([]);
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const [targetAuthorId, setTargetAuthorId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageNum, setPageNum] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  
  const [wpAuth, setWpAuth] = useState<{username: string, appPassword: string} | null>(null);
  const [showAuthFields, setShowAuthFields] = useState(false);
  const [tempUsername, setTempUsername] = useState('');
  const [tempPassword, setTempPassword] = useState('');

  // Wreadom Auth States
  const [importMode, setImportMode] = useState<'single' | 'bundle'>('single');
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [showWreadomLogin, setShowWreadomLogin] = useState(false);

  useEffect(() => {
    onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
  }, []);

  useEffect(() => {
    discoverAuthors();
    fetchFirestoreAuthors();
  }, [wpAuth, currentUser]);

  const handleGoogleLogin = async () => {
    try {
      setStatus('Logging into Wreadom with Google...');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setStatus('Wreadom Login Successful!');
      setShowWreadomLogin(false);
      setTimeout(() => setStatus(''), 2000);
    } catch (error: any) {
      console.error('Google login failed:', error);
      setStatus(`Google Login Failed: ${error.message}`);
    }
  };

  const handleWreadomLogout = async () => {
    await signOut(auth);
    setStatus('Logged out of Wreadom');
    setTimeout(() => setStatus(''), 2000);
  };

  const fetchFirestoreAuthors = async () => {
    try {
      // Changed from 'authors' to 'users' to match Wreadom schema
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);
      const authors = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          // Priority: Pen Name > Display Name > Username
          name: data.penName || data.displayName || data.username || 'Unknown'
        };
      });
      // Sort authors alphabetically
      authors.sort((a, b) => a.name.localeCompare(b.name));
      setFirestoreAuthors(authors);
    } catch (error) {
      console.error('Error fetching Firestore authors:', error);
      setStatus('Permission Error: Falling back to Port 3000 for better access.');
    }
  };

  const discoverAuthors = async () => {
    setLoadingAuthors(true);
    setStatus('Syncing authors...');
    try {
      let authors = [];
      if (wpAuth) {
        try {
          // Attempt direct fetch with auth
          authors = await fetchAuthorsDirectly(wpAuth);
        } catch (e) {
          console.warn('Direct fetch failed, trying discovery fallback');
          try {
            authors = await fetchAuthorsFromRecentPosts(wpAuth);
          } catch (e2) {
            console.error('Discovery with auth failed, falling back to public access');
            authors = await fetchAuthorsFromRecentPosts();
            setStatus('Logged in, but restricted. Using public discovery.');
            setTimeout(() => setStatus(''), 5000);
          }
        }
      } else {
        authors = await fetchAuthorsFromRecentPosts();
      }
      
      if (authors && authors.length > 0) {
        setAvailableAuthors(authors);
        if (!status) setStatus('');
      } else {
        setStatus('No authors found on the site.');
      }
    } catch (error) {
      console.error('Failed to discover authors', error);
      setStatus('Unable to sync authors. Site might be restricted.');
    } finally {
      setLoadingAuthors(false);
    }
  };

  const loadPosts = async (reset: boolean = true) => {
    setLoadingPosts(true);
    const nextPage = reset ? 1 : pageNum + 1;
    
    if (reset) {
      setPosts([]);
      setSelectedIds(new Set());
      setPageNum(1);
    }

    try {
      const authorId = authorFilter === 'all' ? undefined : parseInt(authorFilter);
      setStatus(`Loading results...`);
      const result = await fetchWPPosts(nextPage, authorId, wpAuth || undefined, searchQuery);
      
      const newPosts = reset ? result.posts : [...posts, ...result.posts];
      setPosts(newPosts);
      setPageNum(nextPage);
      setHasMore(nextPage < result.totalPages);
      
      setStatus(`Loaded ${newPosts.length} posts. ${nextPage < result.totalPages ? 'More available.' : 'All caught up.'}`);
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      console.error('Failed to load posts', error);
      setStatus('Error loading posts. Check connection or search query.');
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleApplyAuth = () => {
    if (tempUsername && tempPassword) {
      setWpAuth({ username: tempUsername, appPassword: tempPassword });
      setShowAuthFields(false);
      setStatus('Credentials applied!');
      setTimeout(() => setStatus(''), 2000);
    } else {
      setWpAuth(null);
      setShowAuthFields(false);
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const postDate = new Date(post.date).getTime();
      const afterStart = !startDate || postDate >= new Date(startDate).getTime();
      const beforeEnd = !endDate || postDate <= new Date(endDate).getTime();
      return afterStart && beforeEnd;
    });
  }, [posts, startDate, endDate]);

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredPosts.length && filteredPosts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPosts.map(p => p.id)));
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    if (!targetAuthorId) {
      setStatus('Error: Please select a target Wreadom author first.');
      return;
    }

    setImporting(true);
    setStatus(`Importing ${selectedIds.size} posts...`);

    const selectedPosts = posts.filter((p) => selectedIds.has(p.id));
    const targetAuthor = firestoreAuthors.find(a => a.id === targetAuthorId);
    let successCount = 0;

    if (importMode === 'bundle' && selectedPosts.length > 0) {
      try {
        // Reverse posts so that the oldest one (usually Chapter 1) comes first in the index
        const chronologicalPosts = [...selectedPosts].reverse();
        const firstPost = chronologicalPosts[0];
        setStatus(`Bundling ${chronologicalPosts.length} posts into: ${firstPost.title.rendered}...`);

        const cleanTitle = DOMPurify.sanitize(firstPost.title.rendered, { ALLOWED_TAGS: [] });
        const doc = new DOMParser().parseFromString(cleanTitle, 'text/html');
        const finalTitle = (doc.body.textContent || cleanTitle).trim();

        let coverUrl = '';
        const wpMediaUrl = getFeaturedMediaUrl(firstPost);
        if (wpMediaUrl) {
          try {
            coverUrl = await uploadUrlToCloudinary(wpMediaUrl);
          } catch (err) {
            console.error('Cloudinary upload failed for bundle cover', err);
          }
        }

        const chapters = chronologicalPosts.map((post, index) => {
          const chCleanTitle = DOMPurify.sanitize(post.title.rendered, { ALLOWED_TAGS: [] });
          const chDoc = new DOMParser().parseFromString(chCleanTitle, 'text/html');
          const chFinalTitle = (chDoc.body.textContent || chCleanTitle).trim();

          return {
            id: `ch-${Math.random().toString(36).substr(2, 9)}`,
            title: chFinalTitle,
            content: post.content.rendered,
            index: index,
            status: 'published' as const
          };
        });

        const book: Omit<Book, 'id'> = {
          title: finalTitle,
          description: DOMPurify.sanitize(firstPost.excerpt.rendered, { ALLOWED_TAGS: [] }),
          coverUrl: coverUrl,
          authors: [{ 
            name: targetAuthor?.name || getAuthorName(firstPost), 
            birth_year: null, 
            death_year: null 
          }],
          authorId: targetAuthorId,
          subjects: ['Imported', 'Bundle', 'WordPress'],
          languages: ['Hindi'],
          formats: {},
          download_count: 0,
          media_type: 'texts',
          bookshelves: [],
          source: 'firestore',
          isOriginal: true,
          contentType: 'article',
          status: 'draft',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          chapters: chapters
        };

        await addDoc(collection(db, 'books'), book);
        successCount = selectedPosts.length;
      } catch (error) {
        console.error('Bundle import failed', error);
      }
    } else {
      for (const post of selectedPosts) {
        try {
          setStatus(`Importing: ${post.title.rendered}...`);
          
          // Decode HTML entities and strip tags from title
          const cleanTitle = DOMPurify.sanitize(post.title.rendered, { ALLOWED_TAGS: [] });
          const doc = new DOMParser().parseFromString(cleanTitle, 'text/html');
          const finalTitle = (doc.body.textContent || cleanTitle).trim();

          let coverUrl = '';
          const wpMediaUrl = getFeaturedMediaUrl(post);
          if (wpMediaUrl) {
            try {
              coverUrl = await uploadUrlToCloudinary(wpMediaUrl);
            } catch (err) {
              console.error('Cloudinary upload failed for post', post.id, err);
            }
          }

          const book: Omit<Book, 'id'> = {
            title: finalTitle,
            description: DOMPurify.sanitize(post.excerpt.rendered, { ALLOWED_TAGS: [] }),
            coverUrl: coverUrl,
            authors: [{ 
              name: targetAuthor?.name || getAuthorName(post), 
              birth_year: null, 
              death_year: null 
            }],
            authorId: targetAuthorId,
            subjects: ['Imported', 'WordPress'],
            languages: ['Hindi'],
            formats: {},
            download_count: 0,
            media_type: 'texts',
            bookshelves: [],
            source: 'firestore',
            isOriginal: true,
            contentType: 'article',
            status: 'draft',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            chapters: [
              {
                id: `ch-${Math.random().toString(36).substr(2, 9)}`,
                title: finalTitle,
                content: post.content.rendered,
                index: 0,
                status: 'published'
              }
            ]
          };

          await addDoc(collection(db, 'books'), book);
          successCount++;
        } catch (error) {
          console.error('Import failed for post', post.id, error);
        }
      }
    }

    setImporting(false);
    setSelectedIds(new Set());
    setStatus(`Successfully imported ${successCount} posts as drafts!`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-100 p-4 md:p-8 font-sans selection:bg-blue-500/30">
      <header className="mb-8 bg-neutral-900/80 border border-neutral-800 p-6 rounded-3xl shadow-2xl backdrop-blur-xl relative z-20">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-4xl font-black bg-linear-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent tracking-tight">
                Internal Importer
              </h1>
              <p className="text-neutral-400 mt-2 font-medium flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${loadingAuthors ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                Source: srijansamwad.wordpress.com
              </p>
            </div>
            <button 
              onClick={() => setShowAuthFields(!showAuthFields)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${wpAuth ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'}`}
              title="WordPress Login"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </button>

            <button 
              onClick={() => setShowWreadomLogin(!showWreadomLogin)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${currentUser ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'}`}
              title="Wreadom Admin Login"
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                {currentUser && <span className="text-[10px] font-bold">{currentUser.email?.split('@')[0]}</span>}
              </div>
            </button>
          </div>
          
          <div className="flex flex-col xl:flex-row items-end xl:items-center gap-4 w-full xl:w-auto">
            {showAuthFields && (
              <div className="flex flex-wrap items-center gap-2 bg-neutral-800/90 p-3 rounded-2xl border border-blue-500/30 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-neutral-500 uppercase ml-1">WordPress API</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={tempUsername}
                      onChange={(e) => setTempUsername(e.target.value)}
                      placeholder="WP Username"
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 py-1.5 px-3 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-hidden w-32"
                    />
                    <input 
                      type="password" 
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      placeholder="Application Password"
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 py-1.5 px-3 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 outline-hidden w-40"
                    />
                    <button 
                      onClick={handleApplyAuth}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      Save
                    </button>
                    <a 
                      href="https://wordpress.com/me/security/logins" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[9px] text-blue-400 hover:underline ml-1"
                    >
                      Get App Password
                    </a>
                  </div>
                </div>
              </div>
            )}

            {showWreadomLogin && (
              <div className="flex flex-wrap items-center gap-2 bg-neutral-800/90 p-3 rounded-2xl border border-blue-500/30 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-bold text-neutral-500 uppercase ml-1">Wreadom Admin Auth (Required for Import)</span>
                  <div className="flex items-center gap-2">
                    {currentUser ? (
                      <div className="flex items-center gap-3">
                         <span className="text-xs text-neutral-300 font-medium">Signed in as <b className="text-blue-400">{currentUser.email}</b></span>
                         <button 
                           onClick={handleWreadomLogout}
                           className="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border border-red-500/20"
                         >
                           Sign Out
                         </button>
                      </div>
                    ) : (
                      <button 
                        onClick={handleGoogleLogin}
                        className="bg-white text-black hover:bg-neutral-200 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-lg"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.14-4.53z"/>
                        </svg>
                        Sign in with Google
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 bg-neutral-800/50 p-2 rounded-2xl border border-neutral-700/50">
              <div className="relative group">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadPosts(true)}
                  placeholder="Search posts..."
                  className="bg-neutral-800 border border-neutral-700 text-neutral-200 py-2 px-4 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium text-sm w-48 group-hover:border-emerald-500/30"
                />
              </div>

              <div className="relative">
                <select
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                  disabled={loadingAuthors}
                  className="bg-neutral-800 border border-neutral-700 text-neutral-200 py-2 px-4 pr-10 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 transition-all font-semibold cursor-pointer text-sm disabled:opacity-50"
                >
                  <option value="all">{loadingAuthors ? 'Syncing Authors...' : 'Every Author'}</option>
                  {availableAuthors.map(auth => (
                    <option key={auth.id} value={auth.id.toString()}>{auth.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 text-neutral-200 py-2 px-3 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Start"
                />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 text-neutral-200 py-2 px-3 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500/50"
                  placeholder="End"
                />
              </div>

              <button
                onClick={() => loadPosts(true)}
                disabled={loadingPosts || loadingAuthors}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-lg active:scale-95 cursor-pointer flex items-center gap-2"
              >
                {loadingPosts && pageNum === 1 ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                )}
                Search / Load
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 bg-neutral-800/50 p-2 rounded-2xl border border-neutral-700/50">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-neutral-500 ml-1 uppercase">Target Author</span>
                <select
                  value={targetAuthorId}
                  onChange={(e) => setTargetAuthorId(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 text-blue-400 py-2 px-4 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 transition-all font-bold cursor-pointer text-xs"
                >
                  <option value="">Select Wreadom Author...</option>
                  {firestoreAuthors.map(auth => (
                    <option key={auth.id} value={auth.id}>{auth.name}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex flex-col gap-1 pr-2">
                <span className="text-[9px] font-bold text-neutral-500 ml-1 uppercase">Import Mode</span>
                <div className="flex bg-neutral-900 border border-neutral-700 rounded-xl p-1">
                  <button 
                    onClick={() => setImportMode('single')}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${importMode === 'single' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    Individual
                  </button>
                  <button 
                    onClick={() => setImportMode('bundle')}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${importMode === 'bundle' ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    Bundle
                  </button>
                </div>
              </div>

              <button
                onClick={handleImport}
                disabled={importing || selectedIds.size === 0 || !targetAuthorId}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 px-6 py-2.5 rounded-2xl font-bold transition-all shadow-xl active:scale-95 cursor-pointer disabled:cursor-not-allowed border border-blue-500/20 text-sm whitespace-nowrap h-fit self-end"
              >
                {importing ? 'Importing...' : `Import (${selectedIds.size})`}
              </button>
            </div>
          </div>
        </div>
      </header>

      {status && (
        <div className={`mb-8 p-4 rounded-2xl border transition-all duration-300 relative z-10 ${
          status.includes('Error') || status.includes('failed') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400 font-medium'
        }`}>
          <p className="text-sm flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${status.includes('Error') || status.includes('failed') ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`}></span>
            {status}
          </p>
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden min-h-[400px]">
        {!posts.length && !loadingPosts ? (
          <div className="py-32 text-center">
            <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-neutral-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">
              {loadingAuthors ? 'Syncing with WordPress Authors...' : 'Select an author and click Load Posts'}
            </p>
          </div>
        ) : loadingPosts ? (
          <div className="flex flex-col justify-center items-center h-80 gap-4">
            <div className="w-10 h-10 border-4 border-t-blue-500 border-neutral-800 rounded-full animate-spin"></div>
            <p className="text-neutral-500 text-sm font-bold animate-pulse">Loading Author Posts...</p>
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-neutral-800">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="bg-neutral-800/80">
                  <th className="p-4 w-12 border-b border-r border-neutral-700 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredPosts.length}
                      onChange={toggleAll}
                      className="w-5 h-5 rounded bg-neutral-800 border-neutral-600 text-blue-600 focus:ring-blue-500/40 cursor-pointer accent-blue-500"
                    />
                  </th>
                  <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-r border-neutral-700 w-24 text-center">Image</th>
                  <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-r border-neutral-700 text-left">Title</th>
                  <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-r border-neutral-700 w-32 text-left">Author</th>
                  <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-r border-neutral-700 w-28 text-left">Date</th>
                  <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest border-b border-neutral-700 text-left">Snippet</th>
                </tr>
              </thead>
              <tbody>
                {filteredPosts.map((post) => {
                  const isSelected = selectedIds.has(post.id);
                  const cover = getFeaturedMediaUrl(post);
                  return (
                    <tr
                      key={post.id}
                      onClick={() => toggleSelect(post.id)}
                      className={`group transition-colors hover:bg-neutral-800/40 cursor-pointer ${
                        isSelected ? 'bg-blue-500/10' : ''
                      }`}
                    >
                      <td className="p-4 border-b border-r border-neutral-800/20 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(post.id)}
                          className="w-5 h-5 rounded bg-neutral-800 border-neutral-600 text-blue-600 focus:ring-blue-500/40 cursor-pointer accent-blue-500"
                        />
                      </td>
                      <td className="p-2 border-b border-r border-neutral-800/20">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700 mx-auto flex items-center justify-center shrink-0">
                          {cover ? (
                            <img 
                              src={cover} 
                              alt="" 
                              className="w-full h-full object-cover block" 
                            />
                          ) : (
                            <div className="text-[8px] text-neutral-600 font-bold uppercase">None</div>
                          )}
                        </div>
                      </td>
                      <td className="p-4 border-b border-r border-neutral-800/20">
                        <h3 
                          className="font-bold text-xs text-neutral-200 group-hover:text-blue-400 transition-colors line-clamp-2 leading-relaxed text-left"
                          dangerouslySetInnerHTML={{ __html: post.title.rendered }}
                        />
                      </td>
                      <td className="p-4 border-b border-r border-neutral-800/20">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-5 h-5 rounded-full bg-linear-to-br from-neutral-700 to-neutral-800 flex items-center justify-center text-[7px] font-black border border-neutral-600 shrink-0">
                            {getAuthorName(post).charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[10px] font-bold text-neutral-400 truncate">
                            {getAuthorName(post)}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 border-b border-r border-neutral-800/20">
                        <span className="text-[10px] font-mono text-neutral-500 whitespace-nowrap">
                          {new Date(post.date).toLocaleDateString('en-GB')}
                        </span>
                      </td>
                      <td className="p-4 border-b border-neutral-800/20">
                        <div 
                          className="text-[10px] text-neutral-400 line-clamp-2 text-justify leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: post.excerpt.rendered }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hasMore && (
              <div className="p-6 text-center border-t border-neutral-800 bg-neutral-900/40">
                <button
                  onClick={() => loadPosts(false)}
                  disabled={loadingPosts}
                  className="inline-flex items-center gap-3 px-8 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-sm font-bold transition-all cursor-pointer border border-neutral-700 hover:border-blue-500/50 shadow-xl disabled:opacity-50"
                >
                  {loadingPosts ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Loading Page {pageNum + 1}...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                      Load More Posts
                    </>
                  )}
                </button>
                <p className="mt-2 text-[10px] font-bold text-neutral-600 tracking-wider">SHOWING {posts.length} POSTS</p>
              </div>
            )}
            
            {filteredPosts.length === 0 && posts.length > 0 && (
              <div className="py-20 text-center bg-neutral-900/50">
                <p className="text-neutral-500 text-sm font-bold uppercase tracking-widest text-[10px]">No matching results for active filters</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
