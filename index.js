import { getContext } from "../../../extensions.js";

// ST 채팅 파일 관리 팝업이 뜰 때 그 안에 버튼 두 개를 심는다.
// ST 버전에 따라 팝업 컨테이너 id가 다를 수 있어서, 후보를 여러 개 시도한다.
const POPUP_CANDIDATES = ["#select_chat_popup", "#shadow_select_chat_popup", ".select_chat_wrapper"];
const BUTTON_BAR_ID = "chat_backup_button_bar";

function getCurrentCharacter() {
    const context = getContext();
    const charId = context.characterId;
    if (charId === undefined || charId === null) return null;
    const character = context.characters[charId];
    if (!character) return null;
    return {
        name: character.name,
        avatar: character.avatar, // 파일명 (예: Seth.png)
    };
}

async function fetchChatList(avatarFile) {
    const res = await fetch("/api/characters/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: avatarFile }),
    });
    if (!res.ok) throw new Error("챗 목록을 가져오지 못했어 (status " + res.status + ")");
    return res.json(); // 배열, 각 항목에 file_name 등이 들어있음
}

async function fetchChatContent(chName, fileName, avatarFile) {
    const res = await fetch("/api/chats/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ch_name: chName, file_name: fileName, avatar_url: avatarFile }),
    });
    if (!res.ok) throw new Error(`'${fileName}' 챗 내용을 가져오지 못했어 (status ${res.status})`);
    return res.json(); // 메시지 객체 배열 (첫 줄은 메타데이터일 수 있음)
}

function messagesToJsonl(messages) {
    return messages.map(m => JSON.stringify(m)).join("\n");
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadText(filename, text) {
    downloadBlob(filename, new Blob([text], { type: "application/x-jsonlines;charset=utf-8" }));
}

function safeFileName(name) {
    return (name || "chat").replace(/[\\/:*?"<>|]/g, "_");
}

async function handleIndividualDownload() {
    const character = getCurrentCharacter();
    if (!character) { toastr.warning("현재 열려있는 캐릭터가 없어."); return; }

    toastr.info("챗 목록 가져오는 중...");
    const list = await fetchChatList(character.avatar);
    if (!list || list.length === 0) { toastr.warning("이 캐릭터의 챗 파일이 없어."); return; }

    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        const fileName = entry.file_name;
        try {
            const messages = await fetchChatContent(character.name, fileName, character.avatar);
            const jsonl = messagesToJsonl(messages);
            downloadText(`${safeFileName(fileName)}.jsonl`, jsonl);
            // 브라우저가 여러 다운로드를 한꺼번에 막는 걸 피하려고 살짝 텀을 둔다
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            console.error(e);
            toastr.error(`'${fileName}' 다운로드 실패`);
        }
    }
    toastr.success(`총 ${list.length}개 챗 파일 다운로드 완료!`);
}

async function handleZipDownload() {
    if (typeof JSZip === "undefined") {
        toastr.error("JSZip 라이브러리를 찾을 수 없어. index.js에 CDN 스크립트 로드가 필요해.");
        return;
    }
    const character = getCurrentCharacter();
    if (!character) { toastr.warning("현재 열려있는 캐릭터가 없어."); return; }

    toastr.info("챗 목록 가져오는 중...");
    const list = await fetchChatList(character.avatar);
    if (!list || list.length === 0) { toastr.warning("이 캐릭터의 챗 파일이 없어."); return; }

    const zip = new JSZip();
    for (const entry of list) {
        const fileName = entry.file_name;
        try {
            const messages = await fetchChatContent(character.name, fileName, character.avatar);
            zip.file(`${safeFileName(fileName)}.jsonl`, messagesToJsonl(messages));
        } catch (e) {
            console.error(e);
            toastr.error(`'${fileName}' 포함 실패`);
        }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`${safeFileName(character.name)}_chats.zip`, blob);
    toastr.success(`총 ${list.length}개 챗 파일을 zip으로 다운로드했어!`);
}

function buildButtonBar() {
    const bar = document.createElement("div");
    bar.id = BUTTON_BAR_ID;
    bar.innerHTML = `
        <button id="chat_backup_individual" class="menu_button">📥 전체 개별 다운로드</button>
        <button id="chat_backup_zip" class="menu_button">🗜️ 전체 zip 다운로드</button>
    `;
    bar.querySelector("#chat_backup_individual").addEventListener("click", handleIndividualDownload);
    bar.querySelector("#chat_backup_zip").addEventListener("click", handleZipDownload);
    return bar;
}

function tryInjectIntoPopup() {
    if (document.getElementById(BUTTON_BAR_ID)) return; // 이미 삽입됨

    for (const selector of POPUP_CANDIDATES) {
        const popup = document.querySelector(selector);
        if (popup) {
            popup.prepend(buildButtonBar());
            return;
        }
    }
}

// 팝업이 나중에 동적으로 생성되므로 MutationObserver로 감시
const observer = new MutationObserver(() => tryInjectIntoPopup());
observer.observe(document.body, { childList: true, subtree: true });

// JSZip CDN 로드 (없을 경우에만)
if (typeof JSZip === "undefined") {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(script);
}

jQuery(() => {
    tryInjectIntoPopup();
});
