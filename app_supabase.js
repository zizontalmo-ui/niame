// Supabase 블롭피쉬 갤러리
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Supabase 설정
const SUPABASE_URL = 'https://fykbzvnpjobbpysmzprs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a2J6dm5wam9iYnB5c216cHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMTk4NzYsImV4cCI6MjA3MTY5NTg3Nn0.-l7kTe4A8mw3sWX_rckvBfAFHXCWBJRGdWUQcVNjJ8M'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentUser = null;

// ---------------------- 초기화 ----------------------
document.addEventListener('DOMContentLoaded', function() {
    checkUser();
    loadPosts();
    setupEventListeners();
    setupGoogleSignIn();
});

// ---------------------- Google 로그인 ----------------------
function setupGoogleSignIn() {
    window.google?.accounts?.id?.initialize({
        client_id: '687333388884-8r6qst40747b2d9ce41gcq8q3im3fl2g.apps.googleusercontent.com',
        callback: handleGoogleSignIn
    });
    renderGoogleButton();
}

function renderGoogleButton() {
    const section = document.getElementById('userSection');
    if (!currentUser) {
        section.innerHTML = `<div class="g_id_signin" data-type="standard"></div>`;
        const waitForGoogle = setInterval(() => {
            if (window.google?.accounts?.id) {
                window.google.accounts.id.renderButton(
                    section.querySelector('.g_id_signin'),
                    { theme: "outline", size: "large" }
                );
                clearInterval(waitForGoogle);
            }
        }, 200);
    }
}

async function handleGoogleSignIn(response) {
    try {
        const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential,
        });
        if (error) throw error;

        currentUser = data.user;
        document.getElementById('uploadSection').classList.remove('hidden');
        renderUser();
        loadPosts();
    } catch (error) {
        console.error('로그인 실패:', error);
        alert('로그인에 실패했습니다.');
    }
}

// ---------------------- 사용자 상태 ----------------------
async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    if (user) document.getElementById('uploadSection').classList.remove('hidden');
    renderUser();

    supabase.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        document.getElementById('uploadSection').classList.toggle('hidden', !currentUser);
        renderUser();
    });
}

function renderUser() {
    const section = document.getElementById('userSection');
    if (!currentUser) {
        renderGoogleButton();
    } else {
        const photoURL = currentUser.user_metadata?.avatar_url || '';
        const displayName = currentUser.user_metadata?.full_name || '익명';
        section.innerHTML = `
            <div class="flex items-center gap-2">
                <img src="${photoURL}" class="w-8 h-8 rounded-full" onerror="this.style.display='none'">
                <span class="text-sm">${displayName}</span>
                <button id="logoutBtn" class="text-xs underline">로그아웃</button>
            </div>
        `;
        document.getElementById('logoutBtn').addEventListener('click', logout);
    }
}

// ---------------------- 로그아웃 ----------------------
async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    document.getElementById('uploadSection').classList.add('hidden');
    renderUser();
    loadPosts();
}

// ---------------------- 파일명 정리 ----------------------
function sanitizeFileName(filename) {
    return filename
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ---------------------- 이미지 업로드 ----------------------
async function uploadImage() {
    if (!currentUser) { 
        alert('로그인 후 업로드하세요.'); 
        return; 
    }

    const fileInput = document.getElementById('fileInput');
    const titleInput = document.getElementById('titleInput');
    const keywordsInput = document.getElementById('keywordsInput');
    const tagsInput = document.getElementById('tagsInput');

    const file = fileInput.files[0];
    if (!file) { 
        alert('사진을 선택하세요.'); 
        return; 
    }
    if (!titleInput.value.trim()) { 
        alert('제목을 입력하세요.'); 
        return; 
    }

    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.textContent = '업로드 중...';
    uploadBtn.disabled = true;

    try {
        const safeName = sanitizeFileName(file.name);
        const fileName = `${Date.now()}_${safeName}`;

        // ----------------- Supabase 스토리지 업로드 -----------------
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('images')
            .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        // ----------------- 퍼블릭 URL 가져오기 -----------------
        const { data: urlData, error: urlError } = supabase.storage
            .from('images')
            .getPublicUrl(fileName);

        if (urlError) throw urlError;
        const publicUrl = urlData.publicUrl;

        // ----------------- posts 테이블에 데이터 삽입 -----------------
        const { error: insertError } = await supabase.from('posts').insert([{
            title: titleInput.value.trim(),
            keywords: keywordsInput.value.split(',').map(s => s.trim()).filter(s => s),
            tags: tagsInput.value.split(' ').map(s => s.trim()).filter(s => s),
            image_url: publicUrl,
            user_name: currentUser.user_metadata?.full_name || '익명',
            user_photo: currentUser.user_metadata?.avatar_url || '',
            user_id: currentUser.id
        }]);

        if (insertError) throw insertError;

        fileInput.value = '';
        titleInput.value = '';
        keywordsInput.value = '';
        tagsInput.value = '';

        alert('업로드 완료! 🐟');
        loadPosts();

    } catch (error) {
        console.error('업로드 실패:', error);
        alert('업로드에 실패했습니다. 콘솔을 확인하세요.');
    } finally {
        uploadBtn.textContent = '업로드';
        uploadBtn.disabled = false;
    }
}

// ---------------------- 게시물 로드 & 렌더링 ----------------------
async function loadPosts() {
    try {
        const searchQuery = document.getElementById('searchInput')?.value?.toLowerCase() || '';
        const sortOption = document.getElementById('sortSelect')?.value || 'newest';

        let query = supabase.from('posts').select('*');

        switch (sortOption) {
            case 'newest': query = query.order('created_at', { ascending: false }); break;
            case 'likes': query = query.order('likes', { ascending: false }); break;
            case 'title': query = query.order('title', { ascending: true }); break;
        }

        const { data: posts, error } = await query;
        if (error) throw error;

        const filteredPosts = searchQuery
            ? posts.filter(post => (post.title + ' ' + (post.tags?.join(' ')||'') + ' ' + (post.keywords?.join(' ')||'')).toLowerCase().includes(searchQuery))
            : posts;

        renderGallery(filteredPosts);

    } catch (error) {
        console.error('데이터 로드 실패:', error);
    }
}

function renderGallery(posts) {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = '';

    if (posts.length === 0) {
        gallery.innerHTML = `
            <tr>
                <td colspan="4" class="p-8 text-center text-gray-500">
                    🐟 아직 업로드된 블롭피쉬가 없어요!<br>
                    <small>첫 번째 블롭피쉬를 업로드해보세요!</small>
                </td>
            </tr>
        `;
        return;
    }

    posts.forEach((post, index) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-200 hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-2 text-center">${index+1}</td>
            <td class="p-2">
                <div class="font-medium">${post.title}</div>
                <div class="text-xs text-gray-500 mb-2">
                    ${post.tags?.length ? post.tags.join(' ') + ' | ' : ''} by ${post.user_name} | ${new Date(post.created_at).toLocaleString()}
                </div>
                <img src="${post.image_url}" class="max-h-40 rounded shadow cursor-pointer hover:scale-105 transition-transform" onclick="showImageModal('${post.id}')" alt="${post.title}">
                <div class="mt-2">
                    <a href="${post.image_url}" download="${post.title}" class="text-blue-600 text-xs underline">다운로드</a>
                </div>
            </td>
            <td class="p-2 text-center">
                <button class="likeBtn text-red-600 hover:scale-110 transition-transform" onclick="toggleLike('${post.id}', ${post.likes})">
                    ❤️ <span>${post.likes}</span>
                </button>
            </td>
            <td class="p-2 text-center text-sm">${new Date(post.created_at).toLocaleString()}</td>
        `;
        gallery.appendChild(tr);
    });
}

// ---------------------- 좋아요 & 이미지 모달 ----------------------
async function toggleLike(postId, currentLikes) {
    try {
        const { error } = await supabase.from('posts').update({ likes: currentLikes+1 }).eq('id', postId);
        if (error) throw error;
        loadPosts();
    } catch (error) {
        console.error('좋아요 실패:', error);
        alert('좋아요에 실패했습니다.');
    }
}

async function showImageModal(postId) {
    try {
        const { data: post, error } = await supabase.from('posts').select('*').eq('id', postId).single();
        if (error) throw error;

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4';
        modal.onclick = () => modal.remove();
        modal.innerHTML = `
            <div class="max-w-4xl max-h-full">
                <img src="${post.image_url}" class="max-w-full max-h-[80vh] rounded shadow-lg mx-auto block">
                <div class="text-white text-center mt-4">
                    <h3 class="text-xl font-bold">${post.title}</h3>
                    <p class="text-sm opacity-75">by ${post.user_name} | ${new Date(post.created_at).toLocaleString()}</p>
                    <div class="mt-2">${post.tags?.map(tag=>`<span class="bg-blue-500 px-2 py-1 rounded text-xs mr-1">${tag}</span>`).join('')||''}</div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        console.error('모달 로드 실패:', error);
    }
}

// ---------------------- 이벤트 리스너 ----------------------
function setupEventListeners() {
    document.getElementById('uploadBtn')?.addEventListener('click', uploadImage);
    document.getElementById('searchInput')?.addEventListener('input', loadPosts);
    document.getElementById('sortSelect')?.addEventListener('change', loadPosts);

    supabase.channel('posts').on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        loadPosts();
    }).subscribe();
}

// ---------------------- 전역 함수 ----------------------
window.toggleLike = toggleLike;
window.showImageModal = showImageModal;
