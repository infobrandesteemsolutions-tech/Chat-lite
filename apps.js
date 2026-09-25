// ============================================================
// CHAT LITE - APP CONTROLLER
// Private messaging uses: public.private_messages
// ============================================================

// ------------------------------------------------------------
// SUPABASE CLIENT
// ------------------------------------------------------------
// supabase.js should be loaded before app.js.
// If it is not loaded, this creates a fallback client.

const APP_SUPABASE_URL = 'https://qclfxoyxnihuttlemzmi.supabase.co';
const APP_SUPABASE_ANON_KEY = 'sb_publishable_-jLY8uajMI_u_mxQHHUAsA_Q5d5FWVG';

let appSupabaseClient = null;

try {
    if (typeof supabaseClient !== 'undefined') {
        appSupabaseClient = supabaseClient;
    } else if (window.supabase) {
        appSupabaseClient = window.supabase.createClient(
            APP_SUPABASE_URL,
            APP_SUPABASE_ANON_KEY
        );
    }
} catch (err) {
    console.error('Supabase initialization error:', err);
}


// ------------------------------------------------------------
// APP STATE
// ------------------------------------------------------------

let currentUser = null;
let activeChatUser = null;
let messageSubscription = null;

// Restore logged-in user when opening another page.
try {
    const savedUser = localStorage.getItem('chatlite_user');

    if (savedUser) {
        currentUser = JSON.parse(savedUser);
    }
} catch (err) {
    console.error('Could not restore Chat Lite user:', err);
}


// ------------------------------------------------------------
// PRIVATE MESSAGE FORMAT
// ------------------------------------------------------------
// Your private_messages table only contains:
//
// id
// sender_username
// receiver_username
// content
//
// Therefore extra information such as message type, reply,
// timestamp and deletion status is stored inside content.

const PRIVATE_MESSAGE_PREFIX = '__CHATLITE_PRIVATE_V1__';

function encodePrivateMessage(
    content,
    type = 'text',
    replyMeta = null,
    createdAt = new Date().toISOString(),
    deletedForEveryone = false
) {
    const payload = {
        content: content,
        type: type,
        reply_to: replyMeta,
        created_at: createdAt,
        is_deleted_for_everyone: deletedForEveryone
    };

    return PRIVATE_MESSAGE_PREFIX + JSON.stringify(payload);
}


function decodePrivateMessage(row) {
    if (!row) return null;

    const result = {
        ...row,
        message_type: 'text',
        reply_to: null,
        created_at: null,
        is_deleted_for_everyone: false
    };

    if (
        typeof row.content !== 'string' ||
        !row.content.startsWith(PRIVATE_MESSAGE_PREFIX)
    ) {
        return result;
    }

    try {
        const raw = row.content.substring(PRIVATE_MESSAGE_PREFIX.length);
        const parsed = JSON.parse(raw);

        result.content =
            typeof parsed.content === 'string'
                ? parsed.content
                : '';

        result.message_type =
            parsed.type ||
            parsed.message_type ||
            'text';

        result.reply_to =
            parsed.reply_to ||
            parsed.reply ||
            null;

        result.created_at =
            parsed.created_at ||
            parsed.timestamp ||
            null;

        result.is_deleted_for_everyone =
            parsed.is_deleted_for_everyone === true;

    } catch (err) {
        console.error('Could not decode private message:', err);
    }

    return result;
}


// ------------------------------------------------------------
// PRIVATE MESSAGE DATABASE API
// ------------------------------------------------------------

window.ChatLitePrivate = {

    // --------------------------------------------------------
    // FETCH PRIVATE CONVERSATION
    // --------------------------------------------------------

    async fetchConversation(me, otherUser) {

        if (!appSupabaseClient) {
            throw new Error('Supabase client is not initialized.');
        }

        if (!me || !otherUser) {
            return [];
        }

        const [sentResult, receivedResult] = await Promise.all([

            appSupabaseClient
                .from('private_messages')
                .select('*')
                .eq('sender_username', me)
                .eq('receiver_username', otherUser),

            appSupabaseClient
                .from('private_messages')
                .select('*')
                .eq('sender_username', otherUser)
                .eq('receiver_username', me)

        ]);

        if (sentResult.error) {
            console.error(
                'Error loading sent private messages:',
                sentResult.error
            );
            throw sentResult.error;
        }

        if (receivedResult.error) {
            console.error(
                'Error loading received private messages:',
                receivedResult.error
            );
            throw receivedResult.error;
        }

        const rows = [
            ...(sentResult.data || []),
            ...(receivedResult.data || [])
        ];

        const messages = rows
            .map(decodePrivateMessage)
            .filter(Boolean);

        // New encoded messages have created_at.
        // Older plain messages may not.
        messages.sort((a, b) => {

            if (a.created_at && b.created_at) {
                return (
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                );
            }

            if (a.created_at) return -1;
            if (b.created_at) return 1;

            return 0;
        });

        return messages;
    },


    // --------------------------------------------------------
    // SEND PRIVATE MESSAGE
    // --------------------------------------------------------

    async send({
        sender,
        receiver,
        content,
        type = 'text',
        replyMeta = null
    }) {

        if (!appSupabaseClient) {
            throw new Error('Supabase client is not initialized.');
        }

        const createdAt = new Date().toISOString();

        const storedContent = encodePrivateMessage(
            content,
            type,
            replyMeta,
            createdAt,
            false
        );

        const payload = {
            id: crypto.randomUUID(),
            sender_username: sender,
            receiver_username: receiver,
            content: storedContent
        };

        const { data, error } = await appSupabaseClient
            .from('private_messages')
            .insert([payload])
            .select()
            .single();

        if (error) {
            console.error('Private message insert error:', error);
            throw error;
        }

        return decodePrivateMessage(data);
    },


    // --------------------------------------------------------
    // DELETE FOR EVERYONE
    // --------------------------------------------------------

    async deleteForEveryone(message) {

        if (!appSupabaseClient || !message || !message.id) {
            throw new Error('Invalid private message.');
        }

        const storedContent = encodePrivateMessage(
            message.content,
            message.message_type || 'text',
            message.reply_to || null,
            message.created_at || new Date().toISOString(),
            true
        );

        const { data, error } = await appSupabaseClient
            .from('private_messages')
            .update({
                content: storedContent
            })
            .eq('id', message.id)
            .select()
            .single();

        if (error) {
            console.error('Delete-for-everyone error:', error);
            throw error;
        }

        return decodePrivateMessage(data);
    },


    // --------------------------------------------------------
    // REALTIME PRIVATE MESSAGES
    // --------------------------------------------------------

    subscribe(me, otherUser, callback) {

        if (!appSupabaseClient) {
            console.error('Supabase client is not initialized.');
            return null;
        }

        const channelName =
            `private_messages_${me}_${otherUser}_${Date.now()}`;

        const channel = appSupabaseClient
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'private_messages'
                },
                payload => {

                    const row = payload.new;

                    if (!row) return;

                    const isConversationMessage =
                        (
                            row.sender_username === me &&
                            row.receiver_username === otherUser
                        ) ||
                        (
                            row.sender_username === otherUser &&
                            row.receiver_username === me
                        );

                    if (!isConversationMessage) {
                        return;
                    }

                    const message = decodePrivateMessage(row);

                    if (callback) {
                        callback(message);
                    }
                }
            )
            .subscribe(status => {
                console.log(
                    'Private message realtime status:',
                    status
                );
            });

        return channel;
    }
};


// ------------------------------------------------------------
// VIEW NAVIGATION
// ------------------------------------------------------------

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


// ------------------------------------------------------------
// LOGIN MODAL
// ------------------------------------------------------------

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


// ------------------------------------------------------------
// REGISTRATION
// ------------------------------------------------------------

async function handleRegister(e) {

    e.preventDefault();

    if (!appSupabaseClient) {
        alert('Database client not initialized properly.');
        return;
    }

    const name =
        document.getElementById('reg-name').value.trim();

    const gender =
        document.getElementById('reg-gender').value;

    const username =
        document.getElementById('reg-username')
            .value
            .trim()
            .toLowerCase();

    const password =
        document.getElementById('reg-password').value;

    const code =
        document.getElementById('reg-code')
            .value
            .trim();

    if (code !== 'Krinox1803') {
        alert('Invalid Access Code! Please enter the correct code.');
        return;
    }

    const { data: existing, error: checkError } =
        await appSupabaseClient
            .from('profiles')
            .select('username')
            .eq('username', username)
            .maybeSingle();

    if (checkError) {
        console.error(checkError);
        alert('Could not check username.');
        return;
    }

    if (existing) {
        alert('Username is already taken. Please choose another.');
        return;
    }

    const { error } =
        await appSupabaseClient
            .from('profiles')
            .insert([{
                name,
                gender,
                username,
                password
            }]);

    if (error) {
        alert(
            'Error creating profile: ' +
            error.message
        );
        return;
    }

    alert(
        'Profile created successfully! Please sign in using Access Chats.'
    );

    document
        .getElementById('register-form')
        .reset();

    switchView('view-welcome');
}


// ------------------------------------------------------------
// LOGIN
// ------------------------------------------------------------

async function handleLogin(e) {

    e.preventDefault();

    if (!appSupabaseClient) {
        alert('Database client not initialized properly.');
        return;
    }

    const username =
        document.getElementById('login-username')
            .value
            .trim()
            .toLowerCase();

    const password =
        document.getElementById('login-password')
            .value;

    const { data, error } =
        await appSupabaseClient
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

    // Make the logged-in user available to chatroom.html.
    localStorage.setItem(
        'chatlite_user',
        JSON.stringify(currentUser)
    );

    closeLoginModal();

    const displayEl =
        document.getElementById('current-user-display');

    if (displayEl) {
        displayEl.textContent =
            `${currentUser.name} (@${currentUser.username})`;
    }

    loadChatList();

    switchView('view-chatlist');
}


// ------------------------------------------------------------
// LOGOUT
// ------------------------------------------------------------

function handleLogout() {

    currentUser = null;
    activeChatUser = null;

    localStorage.removeItem('chatlite_user');

    if (messageSubscription && appSupabaseClient) {
        appSupabaseClient.removeChannel(messageSubscription);
    }

    messageSubscription = null;

    switchView('view-welcome');
}


// ------------------------------------------------------------
// CHAT LIST
// ------------------------------------------------------------

async function loadChatList() {

    if (!appSupabaseClient || !currentUser) {
        return;
    }

    const {
        data: members,
        error
    } = await appSupabaseClient
        .from('profiles')
        .select('*')
        .neq('username', currentUser.username);

    const listContainer =
        document.getElementById('members-list');

    if (!listContainer) {
        return;
    }

    listContainer.innerHTML = '';

    if (
        error ||
        !members ||
        members.length === 0
    ) {
        listContainer.innerHTML = `
            <div class="p-6 text-center text-slate-500 text-sm">
                No other members found yet.
            </div>
        `;

        return;
    }

    members.forEach(member => {

        const item =
            document.createElement('div');

        item.className =
            'flex items-center gap-3 p-4 hover:bg-slate-900/60 cursor-pointer transition-all';

        item.innerHTML = `
            <div class="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-400 text-sm">
                ${member.name.charAt(0).toUpperCase()}
            </div>

            <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-sm truncate">
                    ${member.name}
                </h4>

                <p class="text-xs text-slate-400 truncate">
                    @${member.username} &bull; ${member.gender}
                </p>
            </div>

            <span class="text-xs text-indigo-400 font-medium">
                Chat &rarr;
            </span>
        `;

        item.onclick = () => openChatRoom(member);

        listContainer.appendChild(item);
    });
}


// ------------------------------------------------------------
// OLD APP CHAT CONTROLLER
// ------------------------------------------------------------
// Kept so app.js remains operational.
//
// IMPORTANT:
// It now uses private_messages through ChatLitePrivate.
// It no longer uses the old messages table.

async function openChatRoom(member) {

    activeChatUser = member;

    const nameEl =
        document.getElementById('active-chat-name');

    const genderEl =
        document.getElementById('active-chat-gender');

    const avatarEl =
        document.getElementById('active-chat-avatar');

    if (nameEl) {
        nameEl.textContent = member.name;
    }

    if (genderEl) {
        genderEl.textContent =
            `@${member.username} • ${member.gender}`;
    }

    if (avatarEl) {
        avatarEl.textContent =
            member.name.charAt(0).toUpperCase();
    }

    switchView('view-chatroom');

    await fetchMessages();

    subscribeToMessages();
}


// ------------------------------------------------------------
// OLD FETCH FUNCTION
// ------------------------------------------------------------
// Still available for the existing app architecture,
// but now reads from private_messages.

async function fetchMessages() {

    if (
        !currentUser ||
        !activeChatUser ||
        !window.ChatLitePrivate
    ) {
        return;
    }

    try {

        const messages =
            await ChatLitePrivate.fetchConversation(
                currentUser.username,
                activeChatUser.username
            );

        const container =
            document.getElementById('chat-messages');

        if (!container) {
            return;
        }

        container.innerHTML = '';

        messages.forEach(msg => {

            if (
                msg.is_deleted_for_everyone
            ) {
                return;
            }

            appendMessageToDOM(msg);
        });

        container.scrollTop =
            container.scrollHeight;

    } catch (error) {

        console.error(
            'Error fetching private messages:',
            error
        );
    }
}


// ------------------------------------------------------------
// BASIC MESSAGE RENDERER FOR OLD APP VIEW
// ------------------------------------------------------------

function appendMessageToDOM(msg) {

    const container =
        document.getElementById('chat-messages');

    if (!container || !currentUser) {
        return;
    }

    const isMe =
        msg.sender_username === currentUser.username;

    const wrapper =
        document.createElement('div');

    wrapper.className =
        `flex flex-col ${
            isMe
                ? 'items-end'
                : 'items-start'
        } space-y-1`;

    const bubble =
        document.createElement('div');

    bubble.className =
        `max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
            isMe
                ? 'bg-indigo-600 text-white rounded-br-none'
                : 'bg-slate-800 text-slate-100 rounded-bl-none border border-slate-700/50'
        }`;

    bubble.textContent =
        msg.content || '';

    const time =
        document.createElement('span');

    time.className =
        'text-[10px] text-slate-500 px-1';

    if (msg.created_at) {

        time.textContent =
            new Date(
                msg.created_at
            ).toLocaleTimeString(
                [],
                {
                    hour: '2-digit',
                    minute: '2-digit'
                }
            );
    }

    wrapper.appendChild(bubble);
    wrapper.appendChild(time);

    container.appendChild(wrapper);
}


// ------------------------------------------------------------
// OLD SEND FUNCTION
// ------------------------------------------------------------

async function sendMessage(e) {

    if (e) {
        e.preventDefault();
    }

    if (
        !currentUser ||
        !activeChatUser
    ) {
        return;
    }

    const input =
        document.getElementById('message-input');

    if (!input) {
        return;
    }

    const content =
        input.value.trim();

    if (!content) {
        return;
    }

    try {

        await ChatLitePrivate.send({
            sender: currentUser.username,
            receiver: activeChatUser.username,
            content: content,
            type: 'text',
            replyMeta: null
        });

        input.value = '';

    } catch (error) {

        alert(
            'Failed to send message: ' +
            error.message
        );
    }
}


// ------------------------------------------------------------
// OLD REALTIME FUNCTION
// ------------------------------------------------------------

function subscribeToMessages() {

    if (
        !currentUser ||
        !activeChatUser ||
        !window.ChatLitePrivate
    ) {
        return;
    }

    if (
        messageSubscription &&
        appSupabaseClient
    ) {
        appSupabaseClient.removeChannel(
            messageSubscription
        );
    }

    messageSubscription =
        ChatLitePrivate.subscribe(
            currentUser.username,
            activeChatUser.username,
            msg => {

                if (
                    msg.is_deleted_for_everyone
                ) {
                    return;
                }

                appendMessageToDOM(msg);

                const container =
                    document.getElementById(
                        'chat-messages'
                    );

                if (container) {
                    container.scrollTop =
                        container.scrollHeight;
                }
            }
        );
}


// ------------------------------------------------------------
// EXPOSE STATE HELPERS
// ------------------------------------------------------------

window.ChatLiteApp = {
    getCurrentUser: () => currentUser,
    getActiveChatUser: () => activeChatUser,
    setActiveChatUser: user => {
        activeChatUser = user;
    }
};