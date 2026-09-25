// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://qclfxoyxnihuttlemzmi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-jLY8uajMI_u_mxQHHUAsA_Q5d5FWVG';

let supabaseClient = null;
try {
supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
console.error('Supabase initialization error:', err);
}

// --- APP STATE ---
let currentUser = null;
let activeChatUser = null;
let messageSubscription = null;

// --- VIEW NAVIGATION CONTROLLER ---
function switchView(viewId) {
document.querySelectorAll('.view').forEach(el => {
el.classList.add('hidden');
el.classList.remove('flex');
});

const target = document.getElementById(viewId);  
if (target) {  
    target.classList.remove('hidden');  
    target.classList.add('flex');  
}

}

// --- MODAL CONTROLLERS ---
function openLoginModal() {
const modal = document.getElementById('login-modal');
if (modal) {
modal.classList.remove('hidden');
modal.classList.add('flex');
}
}

function closeLoginModal() {
const modal = document.getElementById('login-modal');
if (modal) {
modal.classList.add('hidden');
modal.classList.remove('flex');
}
}

// --- REGISTRATION LOGIC ---
async function handleRegister(e) {
e.preventDefault();
if (!supabaseClient) {
alert('Database client not initialized properly.');
return;
}

const name = document.getElementById('reg-name').value.trim();  
const gender = document.getElementById('reg-gender').value;  
const username = document.getElementById('reg-username').value.trim().toLowerCase();  
const password = document.getElementById('reg-password').value;  
const code = document.getElementById('reg-code').value.trim();  

if (code !== 'Krinox1803') {  
    alert('Invalid Access Code! Please enter the correct code.');  
    return;  
}  

// Check if username exists  
const { data: existing, error: checkError } = await supabaseClient  
    .from('profiles')  
    .select('username')  
    .eq('username', username)  
    .maybeSingle();  

if (existing) {  
    alert('Username is already taken. Please choose another.');  
    return;  
}  

// Insert new profile  
const { error } = await supabaseClient  
    .from('profiles')  
    .insert([{ name, gender, username, password }]);  

if (error) {  
    alert('Error creating profile: ' + error.message);  
    return;  
}  

alert('Profile created successfully! Please sign in using Access Chats.');  
document.getElementById('register-form').reset();  
switchView('view-welcome');

}

// --- LOGIN LOGIC ---
async function handleLogin(e) {
e.preventDefault();
if (!supabaseClient) {
alert('Database client not initialized properly.');
return;
}

const username = document.getElementById('login-username').value.trim().toLowerCase();  
const password = document.getElementById('login-password').value;  

const { data, error } = await supabaseClient  
    .from('profiles')  
    .select('*')  
    .eq('username', username)  
    .eq('password', password)  
    .maybeSingle();  

if (error || !data) {  
    alert('Invalid username or password.');  
    return;  
}  

currentUser = data;  
closeLoginModal();  
  
const displayEl = document.getElementById('current-user-display');  
if (displayEl) {  
    displayEl.textContent = `${currentUser.name} (@${currentUser.username})`;  
}  
  
loadChatList();  
switchView('view-chatlist');

}

function handleLogout() {
currentUser = null;
activeChatUser = null;
if (messageSubscription && supabaseClient) {
supabaseClient.removeChannel(messageSubscription);
}
switchView('view-welcome');
}

// --- CHAT LIST LOGIC ---
async function loadChatList() {
if (!supabaseClient || !currentUser) return;

const { data: members, error } = await supabaseClient  
    .from('profiles')  
    .select('*')  
    .neq('username', currentUser.username);  

const listContainer = document.getElementById('members-list');  
if (!listContainer) return;  
  
listContainer.innerHTML = '';  

if (error || !members || members.length === 0) {  
    listContainer.innerHTML = `<div class="p-6 text-center text-slate-500 text-sm">No other members found yet. Have your family members create their profiles!</div>`;  
    return;  
}  

members.forEach(member => {  
    const item = document.createElement('div');  
    item.className = 'flex items-center gap-3 p-4 hover:bg-slate-900/60 cursor-pointer transition-all';  
    item.innerHTML = `  
        <div class="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-400 text-sm">  
            ${member.name.charAt(0).toUpperCase()}  
        </div>  
        <div class="flex-1 min-w-0">  
            <h4 class="font-semibold text-sm truncate">${member.name}</h4>  
            <p class="text-xs text-slate-400 truncate">@${member.username} &bull; ${member.gender}</p>  
        </div>  
        <span class="text-xs text-indigo-400 font-medium">Chat &rarr;</span>  
    `;  
    item.onclick = () => openChatRoom(member);  
    listContainer.appendChild(item);  
});

}

// --- CHAT ROOM & REALTIME MESSAGING ---
async function openChatRoom(member) {
activeChatUser = member;
document.getElementById('active-chat-name').textContent = member.name;
document.getElementById('active-chat-gender').textContent = @${member.username} • ${member.gender};
document.getElementById('active-chat-avatar').textContent = member.name.charAt(0).toUpperCase();

switchView('view-chatroom');  
await fetchMessages();  
subscribeToMessages();

}

async function fetchMessages() {
if (!supabaseClient || !currentUser || !activeChatUser) return;

const container = document.getElementById('chat-messages');  
container.innerHTML = '';  

const { data: messages, error } = await supabaseClient  
    .from('messages')  
    .select('*')  
    .or(`and(sender_username.eq.${currentUser.username},receiver_username.eq.${activeChatUser.username}),and(sender_username.eq.${activeChatUser.username},receiver_username.eq.${currentUser.username})`)  
    .order('created_at', { ascending: true });  

if (error) {  
    console.error('Error fetching messages:', error);  
    return;  
}  

if (messages) {  
    messages.forEach(msg => appendMessageToDOM(msg));  
    container.scrollTop = container.scrollHeight;  
}

}

function appendMessageToDOM(msg) {
const container = document.getElementById('chat-messages');
const isMe = msg.sender_username === currentUser.username;

const wrapper = document.createElement('div');  
wrapper.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`;  

const bubble = document.createElement('div');  
bubble.className = `max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${  
    isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700/50'  
}`;  
bubble.textContent = msg.content;  

const time = document.createElement('span');  
time.className = 'text-[10px] text-slate-500 px-1';  
time.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });  

wrapper.appendChild(bubble);  
wrapper.appendChild(time);  
container.appendChild(wrapper);

}

async function sendMessage(e) {
e.preventDefault();
if (!supabaseClient || !currentUser || !activeChatUser) return;

const input = document.getElementById('message-input');  
const content = input.value.trim();  
if (!content) return;  

const { error } = await supabaseClient  
    .from('messages')  
    .insert([{  
        sender_username: currentUser.username,  
        receiver_username: activeChatUser.username,  
        content: content  
    }]);  

if (error) {  
    alert('Failed to send message: ' + error.message);  
    return;  
}  

input.value = '';

}

function subscribeToMessages() {
if (!supabaseClient) return;
if (messageSubscription) supabaseClient.removeChannel(messageSubscription);

messageSubscription = supabaseClient  
    .channel('public:messages')  
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {  
        const msg = payload.new;  
        if (  
            activeChatUser &&  
            (  
                (msg.sender_username === currentUser.username && msg.receiver_username === activeChatUser.username) ||  
                (msg.sender_username === activeChatUser.username && msg.receiver_username === currentUser.username)  
            )  
        ) {  
            appendMessageToDOM(msg);  
            const container = document.getElementById('chat-messages');  
            container.scrollTop = container.scrollHeight;  
        }  
    })  
    .subscribe();

}