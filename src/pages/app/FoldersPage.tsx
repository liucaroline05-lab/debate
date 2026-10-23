import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { where, type QueryConstraint } from "firebase/firestore";
import {
  ArrowLeft,
  AudioLines,
  Bookmark,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  Image as ImageIcon,
  LockKeyhole,
  Paperclip,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  UsersRound,
  Video,
} from "lucide-react";
import { PageMeta } from "@/components/common/PageMeta";
import { seededDebates, seededResources } from "@/data/firestoreSeeds";
import { FolderCollaboratorsPanel } from "@/features/folders/FolderCollaboratorsPanel";
import { FolderCommentsSection } from "@/features/folders/FolderCommentsSection";
import { FolderEngagementBar } from "@/features/folders/FolderEngagementBar";
import { FolderInvitesBanner } from "@/features/folders/FolderInvitesBanner";
import { useAuth } from "@/features/auth/AuthContext";
import {
  createContentFolder,
  deleteContentFolder,
  deleteContentFolderFile,
  isContentFolderMember,
  saveContentFolderBoardOrder,
  saveContentFolderBoardDimensions,
  updateContentFolder,
  uploadContentFolderFiles,
} from "@/features/folders/folderService";
import { useSeededFirestoreCollection } from "@/hooks/useSeededFirestoreCollection";
import type {
  ContentFolder,
  ContentFolderFile,
  ContentFolderItem,
  ContentFolderReaction,
  ContentFolderSave,
  DebateThread,
  FolderItemType,
  ResourceItem,
  SpeechRecord,
  TabroomImport,
} from "@/types/models";

const EMPTY_FOLDERS: ContentFolder[] = [];
const EMPTY_FOLDER_ITEMS: ContentFolderItem[] = [];
const EMPTY_FOLDER_FILES: ContentFolderFile[] = [];
const EMPTY_FOLDER_REACTIONS: ContentFolderReaction[] = [];
const EMPTY_FOLDER_SAVES: ContentFolderSave[] = [];
const EMPTY_SPEECHES: SpeechRecord[] = [];
const EMPTY_IMPORTS: TabroomImport[] = [];
const FOLDER_BOARD_GAP_PX = 16;

type FolderBoardEntry =
  | { kind: "item"; sortAt: string; item: ContentFolderItem }
  | { kind: "file"; sortAt: string; file: ContentFolderFile }
  | { kind: "folder"; sortAt: string; folder: ContentFolder };

type FolderBoardResizeAxis = "width" | "height" | "both";

interface FolderBoardResizeSession {
  pointerId: number;
  key: string;
  kind: FolderBoardEntry["kind"];
  id: string;
  axis: FolderBoardResizeAxis;
  startX: number;
  startY: number;
  startWidth: number;
  currentWidth: number;
  startHeight: number;
  currentHeight: number;
  storedHeight?: number;
  boardWidthPixels: number;
  minWidthPercent: number;
  widthChanged: boolean;
  heightChanged: boolean;
}

interface FolderBoardDragSession {
  pointerId: number;
  key: string;
  board: HTMLElement;
  initialOrder: string[];
  currentEntries: FolderBoardEntry[];
  preview: HTMLElement;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

const boardEntryKey = (entry: FolderBoardEntry) => `${entry.kind}:${entry.kind === "item" ? entry.item.id : entry.kind === "file" ? entry.file.id : entry.folder.id}`;
const boardEntryOrder = (entry: FolderBoardEntry) => entry.kind === "item" ? entry.item.boardOrder : entry.kind === "file" ? entry.file.boardOrder : entry.folder.boardOrder;
const boardEntryWidth = (entry: FolderBoardEntry) => {
  const width = entry.kind === "item" ? entry.item.boardWidth : entry.kind === "file" ? entry.file.boardWidth : entry.folder.boardWidth;
  if (width) return width <= 4 ? width * 25 : Math.max(20, Math.min(100, width));
  const legacySize = entry.kind === "item" ? entry.item.boardSize : entry.kind === "file" ? entry.file.boardSize : entry.folder.boardSize;
  return legacySize === "small" ? 25 : legacySize === "large" ? 100 : 50;
};
const boardEntryHeight = (entry: FolderBoardEntry) => entry.kind === "item" ? entry.item.boardHeight : entry.kind === "file" ? entry.file.boardHeight : entry.folder.boardHeight;
const boardEntryId = (entry: FolderBoardEntry) => entry.kind === "item" ? entry.item.id : entry.kind === "file" ? entry.file.id : entry.folder.id;

const itemTypeLabels: Record<FolderItemType, string> = {
  speech: "Speech",
  debate: "Async debate",
  resource: "Resource",
};

const toDetailPath = (item: ContentFolderItem) => {
  if (item.itemType === "speech") return `/app/speeches/${item.itemId}`;
  if (item.itemType === "debate") return `/app/debates/${item.itemId}`;
  return `/app/resources/${item.itemSlug || item.itemId}`;
};

const shortText = (value: string, maxLength = 180) => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  const sentenceEnd = normalized.search(/[.!?](?:\s|$)/);
  if (sentenceEnd >= 45 && sentenceEnd < maxLength) return normalized.slice(0, sentenceEnd + 1);
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const eventDate = (value?: string) => value ? new Date(value).getTime() : 0;
const folderVisibility = (folder: ContentFolder): "public" | "private" => folder.visibility === "public" ? "public" : "private";
const fileSizeLabel = (size: number) => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024))} KB`
  : `${(size / (1024 * 1024)).toFixed(1)} MB`;

const folderFileIcon = (kind: ContentFolderFile["kind"]) => {
  if (kind === "image") return ImageIcon;
  if (kind === "video") return Video;
  if (kind === "audio") return AudioLines;
  return FileText;
};

export const FoldersPage = () => {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ownerConstraints = useMemo<QueryConstraint[]>(
    () => userId ? [where("userId", "==", userId)] : [],
    [userId],
  );
  const publicFolderConstraints = useMemo<QueryConstraint[]>(() => [where("visibility", "==", "public")], []);
  const foldersState = useSeededFirestoreCollection<ContentFolder>(
    "folders", EMPTY_FOLDERS, ownerConstraints, Boolean(userId),
    userId ? `folders:${userId}` : undefined,
  );
  const publicFoldersState = useSeededFirestoreCollection<ContentFolder>(
    "folders", EMPTY_FOLDERS, publicFolderConstraints, Boolean(userId),
    "folders:public",
  );
  const sharedFolderConstraints = useMemo<QueryConstraint[]>(
    () => userId ? [where("collaboratorIds", "array-contains", userId)] : [],
    [userId],
  );
  const sharedFoldersState = useSeededFirestoreCollection<ContentFolder>(
    "folders", EMPTY_FOLDERS, sharedFolderConstraints, Boolean(userId),
    userId ? `folders:shared:${userId}` : undefined,
  );
  const ownerFolderItemsState = useSeededFirestoreCollection<ContentFolderItem>(
    "folderItems", EMPTY_FOLDER_ITEMS, ownerConstraints, Boolean(userId),
    userId ? `folder-items:${userId}` : undefined,
  );
  const speechConstraints = useMemo<QueryConstraint[]>(
    () => userId ? [where("creatorId", "==", userId)] : [],
    [userId],
  );
  const speechState = useSeededFirestoreCollection<SpeechRecord>(
    "speeches", EMPTY_SPEECHES, speechConstraints, Boolean(userId),
    userId ? `speeches:owner:${userId}` : undefined,
  );
  const importState = useSeededFirestoreCollection<TabroomImport>(
    "tabroomImports", EMPTY_IMPORTS, ownerConstraints, Boolean(userId),
    userId ? `tabroom-imports:${userId}` : undefined,
  );
  const debateState = useSeededFirestoreCollection<DebateThread>("debates", seededDebates);
  const resourceState = useSeededFirestoreCollection<ResourceItem>("resources", seededResources);

  const allFolders = useMemo(() => Array.from(new Map(
    [...foldersState.data, ...publicFoldersState.data, ...sharedFoldersState.data].map((folder) => [folder.id, folder]),
  ).values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [foldersState.data, publicFoldersState.data, sharedFoldersState.data]);
  const selectedFolder = allFolders.find((folder) => folder.id === folderId);
  const isFolderOwner = Boolean(selectedFolder && selectedFolder.userId === userId);
  const canEditFolder = Boolean(selectedFolder && isContentFolderMember(selectedFolder, userId));

  const selectedContentConstraints = useMemo<QueryConstraint[]>(() => {
    if (!folderId || !selectedFolder || !userId) return [];
    // Private folders are readable by their owner and collaborators, whose
    // items are each stored under the member who added them.
    return folderVisibility(selectedFolder) === "public"
      ? [where("folderId", "==", folderId), where("visibility", "==", "public")]
      : [where("folderId", "==", folderId)];
  }, [folderId, selectedFolder, userId]);
  const selectedFolderItemsState = useSeededFirestoreCollection<ContentFolderItem>(
    "folderItems", EMPTY_FOLDER_ITEMS, selectedContentConstraints,
    Boolean(folderId && selectedFolder), folderId && selectedFolder ? `folder-items:${folderId}:${folderVisibility(selectedFolder)}` : undefined,
  );
  const selectedFolderFilesState = useSeededFirestoreCollection<ContentFolderFile>(
    "folderFiles", EMPTY_FOLDER_FILES, selectedContentConstraints,
    Boolean(folderId && selectedFolder), folderId && selectedFolder ? `folder-files:${folderId}:${folderVisibility(selectedFolder)}` : undefined,
  );
  const personalConstraints = useMemo<QueryConstraint[]>(
    () => userId ? [where("userId", "==", userId)] : [],
    [userId],
  );
  const reactionsState = useSeededFirestoreCollection<ContentFolderReaction>(
    "folderReactions", EMPTY_FOLDER_REACTIONS, personalConstraints, Boolean(userId),
    userId ? `folder-reactions:${userId}` : undefined,
  );
  const savesState = useSeededFirestoreCollection<ContentFolderSave>(
    "folderSaves", EMPTY_FOLDER_SAVES, personalConstraints, Boolean(userId),
    userId ? `folder-saves:${userId}` : undefined,
  );

  const [isCreateOpen, setIsCreateOpen] = useState(searchParams.get("create") === "1");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftVisibility, setDraftVisibility] = useState<"public" | "private">("private");
  const [draftTournamentId, setDraftTournamentId] = useState("");
  const [queryText, setQueryText] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<"All" | "Public" | "Private">("All");
  const [tournamentFilter, setTournamentFilter] = useState("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [isSubfolderFormOpen, setIsSubfolderFormOpen] = useState(false);
  const [subfolderName, setSubfolderName] = useState("");
  const [subfolderBusy, setSubfolderBusy] = useState(false);
  const [subfolderNotice, setSubfolderNotice] = useState("");
  const [isBoardEditing, setIsBoardEditing] = useState(false);
  const [boardOrderOverride, setBoardOrderOverride] = useState<string[] | null>(null);
  const [boardDimensionOverrides, setBoardDimensionOverrides] = useState<Record<string, { width: number; height: number | null }>>({});
  const [draggedBoardCardKey, setDraggedBoardCardKey] = useState<string | null>(null);
  const [activeResizeKey, setActiveResizeKey] = useState<string | null>(null);
  const [boardLayoutBusy, setBoardLayoutBusy] = useState(false);
  const [boardLayoutNotice, setBoardLayoutNotice] = useState("");
  const [fileDraft, setFileDraft] = useState<File[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileNotice, setFileNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resizeSessionRef = useRef<FolderBoardResizeSession | null>(null);
  const dragSessionRef = useRef<FolderBoardDragSession | null>(null);
  const boardRectsBeforeOrderRef = useRef<Map<string, DOMRect> | null>(null);

  useEffect(() => {
    setIsBoardEditing(false);
    setBoardOrderOverride(null);
    setBoardDimensionOverrides({});
    setDraggedBoardCardKey(null);
    setActiveResizeKey(null);
    resizeSessionRef.current = null;
    dragSessionRef.current?.preview.remove();
    dragSessionRef.current = null;
    boardRectsBeforeOrderRef.current = null;
    setBoardLayoutNotice("");
    setCommentsOpen(false);
  }, [folderId]);

  useLayoutEffect(() => {
    const previousRects = boardRectsBeforeOrderRef.current;
    if (!previousRects) return;
    boardRectsBeforeOrderRef.current = null;
    const cards = document.querySelectorAll<HTMLElement>(".folder-pinterest-board [data-board-card-key]");
    cards.forEach((card) => {
      const key = card.dataset.boardCardKey;
      const previous = key ? previousRects.get(key) : undefined;
      if (!previous) return;
      const current = card.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      card.getAnimations().forEach((animation) => animation.cancel());
      card.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)" },
      );
    });
  }, [boardOrderOverride]);

  useEffect(() => {
    if (!draggedBoardCardKey) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      event.preventDefault();
      session.preview.style.left = `${event.clientX - session.offsetX}px`;
      session.preview.style.top = `${event.clientY - session.offsetY}px`;

      const boardRect = session.board.getBoundingClientRect();
      if (event.clientX < boardRect.left || event.clientX > boardRect.right || event.clientY < boardRect.top || event.clientY > boardRect.bottom) return;
      const hoveredCard = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-board-card-key]");
      const cards = Array.from(session.board.querySelectorAll<HTMLElement>("[data-board-card-key]"));
      const target = hoveredCard && session.board.contains(hoveredCard) && hoveredCard.dataset.boardCardKey !== session.key
        ? hoveredCard
        : cards.reduce<HTMLElement | null>((closest, card) => {
          if (card.dataset.boardCardKey === session.key) return closest;
          if (!closest) return card;
          const rect = card.getBoundingClientRect();
          const closestRect = closest.getBoundingClientRect();
          const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
          const closestDistance = Math.hypot(event.clientX - (closestRect.left + closestRect.width / 2), event.clientY - (closestRect.top + closestRect.height / 2));
          return distance < closestDistance ? card : closest;
        }, null);
      const targetKey = target?.dataset.boardCardKey;
      if (!targetKey || targetKey === session.key) return;

      const targetIndex = session.currentEntries.findIndex((entry) => boardEntryKey(entry) === targetKey);
      const sourceIndex = session.currentEntries.findIndex((entry) => boardEntryKey(entry) === session.key);
      if (targetIndex < 0 || sourceIndex < 0) return;
      const targetRect = target!.getBoundingClientRect();
      const cardsInTargetRow = cards.filter((card) => card.dataset.boardCardKey !== session.key
        && Math.abs(card.getBoundingClientRect().top - targetRect.top) < 8).length;
      const afterTarget = cardsInTargetRow > 1
        ? event.clientX > targetRect.left + targetRect.width / 2
        : event.clientY > targetRect.top + targetRect.height / 2;
      let insertIndex = targetIndex + (afterTarget ? 1 : 0);
      if (sourceIndex < insertIndex) insertIndex -= 1;
      if (insertIndex === sourceIndex) return;

      const nextEntries = [...session.currentEntries];
      const [movedEntry] = nextEntries.splice(sourceIndex, 1);
      nextEntries.splice(insertIndex, 0, movedEntry);
      const previousRects = new Map<string, DOMRect>();
      cards.forEach((card) => {
        const key = card.dataset.boardCardKey;
        if (key) previousRects.set(key, card.getBoundingClientRect());
      });
      boardRectsBeforeOrderRef.current = previousRects;
      session.currentEntries = nextEntries;
      session.moved = nextEntries.some((entry, index) => boardEntryKey(entry) !== session.initialOrder[index]);
      setBoardOrderOverride(nextEntries.map(boardEntryKey));
    };

    const finishDrag = (event: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      dragSessionRef.current = null;
      session.preview.remove();
      setDraggedBoardCardKey(null);
      if (!session.moved) return;

      setBoardLayoutBusy(true);
      setBoardLayoutNotice("");
      void saveContentFolderBoardOrder(session.currentEntries.map((entry, order) => ({
        id: boardEntryId(entry),
        kind: entry.kind,
        order,
      }))).then(() => {
        setBoardLayoutNotice("Board order saved.");
      }).catch((error) => {
        const previousRects = new Map<string, DOMRect>();
        session.board.querySelectorAll<HTMLElement>("[data-board-card-key]").forEach((card) => {
          const key = card.dataset.boardCardKey;
          if (key) previousRects.set(key, card.getBoundingClientRect());
        });
        boardRectsBeforeOrderRef.current = previousRects;
        setBoardOrderOverride(session.initialOrder);
        setBoardLayoutNotice(error instanceof Error ? error.message : "Could not save the board order.");
      }).finally(() => setBoardLayoutBusy(false));
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
      dragSessionRef.current?.preview.remove();
      dragSessionRef.current = null;
    };
  }, [draggedBoardCardKey]);

  useEffect(() => {
    if (!activeResizeKey) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = resizeSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      event.preventDefault();
      let currentWidth = session.currentWidth;
      let currentHeight = session.currentHeight;
      let widthChanged = session.widthChanged;
      let heightChanged = session.heightChanged;

      if (session.axis !== "height") {
        const widthDelta = ((event.clientX - session.startX) / session.boardWidthPixels) * 100;
        currentWidth = Math.max(session.minWidthPercent, Math.min(100, session.startWidth + widthDelta));
        widthChanged = Math.abs(currentWidth - session.startWidth) > 0.01;
      }
      if (session.axis !== "width") {
        currentHeight = Math.max(150, Math.min(1000, session.startHeight + event.clientY - session.startY));
        heightChanged = currentHeight !== session.startHeight;
      }

      session.currentWidth = currentWidth;
      session.currentHeight = currentHeight;
      session.widthChanged = widthChanged;
      session.heightChanged = heightChanged;
      setBoardDimensionOverrides((current) => ({
        ...current,
        [session.key]: {
          width: widthChanged ? currentWidth : session.startWidth,
          height: heightChanged ? currentHeight : (session.storedHeight ?? null),
        },
      }));
    };

    const finishResize = (event: PointerEvent) => {
      const session = resizeSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      resizeSessionRef.current = null;
      setActiveResizeKey(null);
      if (!session.widthChanged && !session.heightChanged) {
        setBoardLayoutBusy(false);
        return;
      }

      const dimensions = {
        ...(session.widthChanged ? { boardWidth: session.currentWidth } : {}),
        ...(session.heightChanged ? { boardHeight: session.currentHeight } : {}),
      };
      setBoardLayoutNotice("");
      void saveContentFolderBoardDimensions(session.kind, session.id, dimensions)
        .then(() => setBoardLayoutNotice("Card size saved."))
        .catch((error) => {
          setBoardDimensionOverrides((current) => ({
            ...current,
            [session.key]: { width: session.startWidth, height: session.storedHeight ?? null },
          }));
          setBoardLayoutNotice(error instanceof Error ? error.message : "Could not save the card size.");
        })
        .finally(() => setBoardLayoutBusy(false));
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [activeResizeKey]);

  useEffect(() => {
    if (!folderId || searchParams.get("comments") !== "1") return;
    setCommentsOpen(true);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("comments");
    setSearchParams(nextSearchParams, { replace: true });
  }, [folderId, searchParams, setSearchParams]);

  const allEvents = useMemo(() => {
    const events = importState.data.flatMap((entry) => entry.events ?? []);
    return Array.from(new Map(events.map((event) => [event.id, event])).values())
      .sort((left, right) => eventDate(right.date) - eventDate(left.date));
  }, [importState.data]);
  const selectedTournament = allEvents.find((event) => event.id === draftTournamentId);
  const reactionsByFolder = useMemo(() => new Map(reactionsState.data.map((reaction) => [reaction.folderId, reaction])), [reactionsState.data]);
  const savedFolderIds = useMemo(() => new Set(savesState.data.map((save) => save.folderId)), [savesState.data]);
  const folderItems = ownerFolderItemsState.data;
  const speechById = useMemo(() => new Map(speechState.data.map((speech) => [speech.id, speech])), [speechState.data]);
  const debateById = useMemo(() => new Map(debateState.data.map((debate) => [debate.id, debate])), [debateState.data]);
  const resourceById = useMemo(() => new Map(resourceState.data.map((resource) => [resource.id, resource])), [resourceState.data]);

  const visibleFolders = useMemo(() => {
    const normalizedQuery = queryText.trim().toLowerCase();
    return allFolders.filter((folder) => {
      const isPublic = folderVisibility(folder) === "public";
      if (!isPublic && !isContentFolderMember(folder, userId)) return false;
      if (folder.parentFolderId) return false;
      if (visibilityFilter === "Public" && !isPublic) return false;
      if (visibilityFilter === "Private" && isPublic) return false;
      if (savedOnly && !savedFolderIds.has(folder.id)) return false;
      if (tournamentFilter !== "All" && folder.tournamentId !== tournamentFilter) return false;
      if (normalizedQuery && ![
        folder.name,
        folder.description,
        folder.tournamentName,
        folder.ownerName,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery))) return false;
      return true;
    });
  }, [allFolders, queryText, savedFolderIds, savedOnly, tournamentFilter, userId, visibilityFilter]);

  // Mirrors the speech library: your own and shared folders first, then public
  // folders from other members.
  const myFolders = visibleFolders.filter((folder) => isContentFolderMember(folder, userId));
  const communityFolders = visibleFolders.filter((folder) => !isContentFolderMember(folder, userId));

  const renderFolderCard = (folder: ContentFolder) => {
    const isPublic = folderVisibility(folder) === "public";
    const isOwner = folder.userId === userId;
    const isShared = !isOwner && isContentFolderMember(folder, userId);
    const itemCount = (folder.itemCount ?? (isOwner ? folderItems.filter((item) => item.folderId === folder.id).length : 0)) + (folder.fileCount ?? 0) + allFolders.filter((child) => child.parentFolderId === folder.id).length;
    return (
      <article className="folder-card" key={folder.id}>
        <Link to={`/app/folders/${folder.id}`} className="folder-card-main">
          <div className="folder-card-top"><span className="folder-card-icon"><Folder size={21} aria-hidden="true" /></span><span className={isPublic ? "folder-visibility-pill is-public" : "folder-visibility-pill"}>{isPublic ? <FolderOpen size={14} /> : <LockKeyhole size={14} />}{isPublic ? "Public" : "Private"}</span></div>
          <h3>{folder.name}</h3>
          <span className="folder-card-count">{itemCount} item{itemCount === 1 ? "" : "s"}{folder.ownerName ? ` · ${isOwner ? "You" : folder.ownerName}` : ""}</span>
          {isShared ? <span className="folder-shared-tag"><UsersRound size={14} aria-hidden="true" /> Shared with you</span> : null}
          {folder.tournamentName ? <span className="folder-tournament-tag"><CalendarDays size={14} /> {folder.tournamentName}</span> : null}
          {folder.description ? <span className="folder-card-preview">{folder.description}</span> : null}
          <span className="folder-card-open">Open folder <ChevronRight size={15} /></span>
        </Link>
        {isPublic ? <FolderEngagementBar folder={folder} userId={userId!} reaction={reactionsByFolder.get(folder.id)} isSaved={savedFolderIds.has(folder.id)} compact /> : null}
      </article>
    );
  };

  const openCreateFolder = () => {
    setIsCreateOpen(true);
    setMessage("");
  };

  const closeCreateFolder = () => {
    setIsCreateOpen(false);
    setSearchParams({});
  };

  const handleCreateFolder = async () => {
    if (!currentUser) return;
    if (!draftName.trim()) {
      setMessage("Add a folder name first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const folder = await createContentFolder({
        userId: currentUser.id,
        ownerName: currentUser.displayName,
        name: draftName,
        description: draftDescription,
        visibility: draftVisibility,
        tournamentId: selectedTournament?.id,
        tournamentName: selectedTournament?.name,
      });
      setDraftName("");
      setDraftDescription("");
      setDraftTournamentId("");
      setIsCreateOpen(false);
      setSearchParams({});
      setMessage(`Created “${folder.name}”.`);
      navigate(`/app/folders/${folder.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create this folder.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSubfolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser || !selectedFolder || !isFolderOwner) return;
    if (!subfolderName.trim()) {
      setSubfolderNotice("Add a folder name first.");
      return;
    }
    setSubfolderBusy(true);
    setSubfolderNotice("");
    try {
      const folder = await createContentFolder({
        userId: currentUser.id,
        ownerName: currentUser.displayName,
        name: subfolderName,
        visibility: folderVisibility(selectedFolder),
        parentFolderId: selectedFolder.id,
        tournamentId: selectedFolder.tournamentId,
        tournamentName: selectedFolder.tournamentName,
      });
      setSubfolderName("");
      setIsSubfolderFormOpen(false);
      setSubfolderNotice(`Created “${folder.name}” inside ${selectedFolder.name}.`);
    } catch (error) {
      setSubfolderNotice(error instanceof Error ? error.message : "Unable to create this subfolder.");
    } finally {
      setSubfolderBusy(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!selectedFolder || !isFolderOwner || !userId) return;
    if (!window.confirm(`Delete “${selectedFolder.name}” and remove its folder content?`)) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteContentFolder(selectedFolder.id);
      navigate("/app/folders");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this folder.");
    } finally {
      setBusy(false);
    }
  };

  const handleVisibilityChange = async (visibility: "public" | "private") => {
    if (!selectedFolder || !isFolderOwner || visibility === folderVisibility(selectedFolder)) return;
    setBusy(true);
    setMessage("");
    try {
      await updateContentFolder(selectedFolder, selectedFolder.id, {
        name: selectedFolder.name,
        visibility,
        tournamentId: selectedFolder.tournamentId,
        tournamentName: selectedFolder.tournamentName,
      });
      setMessage(visibility === "public" ? "Folder is now public." : "Folder is now private.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update folder visibility.");
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFiles = async () => {
    if (!selectedFolder || !canEditFolder || !userId || fileDraft.length === 0) return;
    setFileBusy(true);
    setFileNotice("");
    try {
      await uploadContentFolderFiles(selectedFolder, userId, fileDraft, selectedFolderFilesState.data.length);
      setFileDraft([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileNotice("Files uploaded.");
    } catch (error) {
      setFileNotice(error instanceof Error ? error.message : "Unable to upload these files.");
    } finally {
      setFileBusy(false);
    }
  };

  const handleDeleteFile = async (file: ContentFolderFile) => {
    if (!selectedFolder || !canEditFolder) return;
    if (!window.confirm(`Remove “${file.name}” from this folder?`)) return;
    try {
      await deleteContentFolderFile(selectedFolder, file, Math.max(0, selectedFolderFilesState.data.length - 1));
    } catch (error) {
      setFileNotice(error instanceof Error ? error.message : "Unable to remove this file.");
    }
  };

  const getCurrentItemCopy = (item: ContentFolderItem) => {
    if (item.itemType === "speech") {
      const speech = speechById.get(item.itemId);
      return {
        title: speech?.title ?? item.itemTitle,
        subtitle: speech ? `${speech.format} · ${speech.eventName}` : item.itemSubtitle,
        summary: speech?.summary || speech?.aiSummary?.overview || speech?.coachNotes || item.itemSummary,
      };
    }
    if (item.itemType === "debate") {
      const debate = debateById.get(item.itemId);
      return {
        title: debate?.topic ?? item.itemTitle,
        subtitle: debate ? `${debate.format} · ${debate.status}` : item.itemSubtitle,
        summary: debate?.summary || debate?.aiSummary?.neutralOutcome.summary || item.itemSummary,
      };
    }
    const resource = resourceById.get(item.itemId);
    return {
      title: resource?.title ?? item.itemTitle,
      subtitle: resource ? `${resource.category} · ${resource.level}` : item.itemSubtitle,
      summary: resource?.longDescription || resource?.description || item.itemSummary,
    };
  };

  if (!userId) return null;

  if (folderId) {
    if ((foldersState.isLoading || publicFoldersState.isLoading) && !selectedFolder) {
      return <section className="app-card folder-empty-state"><p>Loading folders…</p></section>;
    }
    if (!selectedFolder) {
      return (
        <>
          <PageMeta title="Folder not found" description="This folder may have been removed or is private." />
          <section className="app-card folder-empty-state">
            <FolderOpen size={30} aria-hidden="true" />
            <h1>Folder not found</h1>
            <p>This folder may have been removed or is private.</p>
            <Link to="/app/folders" className="btn btn-secondary"><ArrowLeft size={16} /> Back to folders</Link>
          </section>
        </>
      );
    }

    const subfolders = allFolders.filter((folder) => folder.parentFolderId === selectedFolder.id);
    const parentFolder = selectedFolder.parentFolderId
      ? allFolders.find((folder) => folder.id === selectedFolder.parentFolderId)
      : undefined;
    const sortedFiles = [...selectedFolderFilesState.data].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
    const boardCards: FolderBoardEntry[] = [
      ...selectedFolderItemsState.data.map((item) => ({ kind: "item" as const, sortAt: item.addedAt, item })),
      ...sortedFiles.map((file) => ({ kind: "file" as const, sortAt: file.uploadedAt, file })),
      ...subfolders.map((folder) => ({ kind: "folder" as const, sortAt: folder.createdAt, folder })),
    ].sort((left, right) => {
      const leftOrder = boardEntryOrder(left);
      const rightOrder = boardEntryOrder(right);
      if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return right.sortAt.localeCompare(left.sortAt);
    });
    const visibleBoardCards = boardOrderOverride
      ? [...boardCards].sort((left, right) => {
        const leftIndex = boardOrderOverride.indexOf(boardEntryKey(left));
        const rightIndex = boardOrderOverride.indexOf(boardEntryKey(right));
        if (leftIndex < 0 && rightIndex < 0) return right.sortAt.localeCompare(left.sortAt);
        if (leftIndex < 0) return 1;
        if (rightIndex < 0) return -1;
        return leftIndex - rightIndex;
      })
      : boardCards;

    const handleBoardDragStart = (event: ReactPointerEvent<HTMLButtonElement>, entry: FolderBoardEntry) => {
      if (!isBoardEditing || boardLayoutBusy || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const card = event.currentTarget.closest<HTMLElement>(".folder-board-card");
      const board = card?.closest<HTMLElement>(".folder-pinterest-board");
      if (!card || !board) return;

      const key = boardEntryKey(entry);
      const rect = card.getBoundingClientRect();
      const preview = card.cloneNode(true) as HTMLElement;
      preview.removeAttribute("data-board-card-key");
      preview.querySelectorAll(".folder-board-edit-controls, .folder-board-resize-handle, .folder-file-remove").forEach((control) => control.remove());
      preview.setAttribute("aria-hidden", "true");
      preview.classList.add("is-drag-preview");
      Object.assign(preview.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        minWidth: "0",
        maxWidth: "none",
        flex: "none",
        margin: "0",
        zIndex: "9999",
        pointerEvents: "none",
        transform: "scale(1.02)",
      });
      document.body.appendChild(preview);
      dragSessionRef.current = {
        pointerId: event.pointerId,
        key,
        board,
        initialOrder: visibleBoardCards.map(boardEntryKey),
        currentEntries: [...visibleBoardCards],
        preview,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false,
      };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The window listeners still handle the pointer if capture is unavailable.
      }
      setDraggedBoardCardKey(key);
      setBoardLayoutNotice("");
    };

    const handleBoardResizeStart = (
      event: ReactPointerEvent<HTMLButtonElement>,
      entry: FolderBoardEntry,
      axis: FolderBoardResizeAxis,
    ) => {
      if (!isBoardEditing || boardLayoutBusy) return;
      event.preventDefault();
      event.stopPropagation();
      const card = event.currentTarget.closest<HTMLElement>(".folder-board-card");
      const board = card?.closest<HTMLElement>(".folder-pinterest-board");
      if (!card || !board) return;

      const key = boardEntryKey(entry);
      const boardWidthPixels = Math.max(1, board.clientWidth);
      const minWidthPercent = Math.min(100, (220 / boardWidthPixels) * 100);
      const startWidth = Math.max(minWidthPercent, Math.min(100, boardDimensionOverrides[key]?.width ?? boardEntryWidth(entry)));
      const storedHeight = boardDimensionOverrides[key]?.height ?? boardEntryHeight(entry);
      const startHeight = card.getBoundingClientRect().height;
      const session: FolderBoardResizeSession = {
        pointerId: event.pointerId,
        key,
        kind: entry.kind,
        id: boardEntryId(entry),
        axis,
        startX: event.clientX,
        startY: event.clientY,
        startWidth,
        currentWidth: startWidth,
        startHeight,
        currentHeight: startHeight,
        storedHeight: storedHeight ?? undefined,
        boardWidthPixels,
        minWidthPercent,
        widthChanged: false,
        heightChanged: false,
      };
      resizeSessionRef.current = session;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The window listeners still handle the pointer if capture is unavailable.
      }
      setBoardDimensionOverrides((current) => ({
        ...current,
        [key]: { width: startWidth, height: storedHeight ?? null },
      }));
      setActiveResizeKey(key);
      setBoardLayoutBusy(true);
      setBoardLayoutNotice("");
    };

    const renderBoardEditControls = (entry: FolderBoardEntry) => {
      if (!isBoardEditing) return null;
      const key = boardEntryKey(entry);
      const resizeDisabled = boardLayoutBusy && activeResizeKey !== key;
      return (
        <>
          <div className="folder-board-edit-controls" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="folder-board-drag-handle" title="Drag to reorder" aria-label="Drag to reorder" onPointerDown={(event) => handleBoardDragStart(event, entry)}><GripVertical size={18} aria-hidden="true" /></button>
          </div>
          <button type="button" className="folder-board-resize-handle is-width" aria-label="Drag right edge to resize card width" title="Drag to resize width" disabled={resizeDisabled} onPointerDown={(event) => handleBoardResizeStart(event, entry, "width")} />
          <button type="button" className="folder-board-resize-handle is-height" aria-label="Drag bottom edge to resize card height" title="Drag to resize height" disabled={resizeDisabled} onPointerDown={(event) => handleBoardResizeStart(event, entry, "height")} />
          <button type="button" className="folder-board-resize-handle is-corner" aria-label="Drag corner to resize card width and height" title="Drag to resize width and height" disabled={resizeDisabled} onPointerDown={(event) => handleBoardResizeStart(event, entry, "both")} />
        </>
      );
    };

    const toggleBoardEditing = () => {
      if (isBoardEditing) {
        setIsBoardEditing(false);
        setDraggedBoardCardKey(null);
        return;
      }
      setBoardOrderOverride(visibleBoardCards.map(boardEntryKey));
      setIsBoardEditing(true);
      setBoardLayoutNotice("");
    };

    return (
      <>
        <PageMeta title={selectedFolder.name} description={`Review the items collected in ${selectedFolder.name}.`} />
        <header className="route-header folder-detail-header">
          <div>
            <Link to="/app/folders" className="folder-back-link"><ArrowLeft size={16} aria-hidden="true" /> All folders</Link>
            <p className="eyebrow">{folderVisibility(selectedFolder) === "public" ? "Public folder" : "Private folder"}</p>
            <h1>{selectedFolder.name}</h1>
            <p>{selectedFolder.ownerName ? `Created by ${selectedFolder.ownerName} · ` : ""}{boardCards.length} item{boardCards.length === 1 ? "" : "s"}{selectedFolder.tournamentName ? ` · ${selectedFolder.tournamentName}` : ""}</p>
            {selectedFolder.tournamentName ? <span className="folder-tournament-tag"><CalendarDays size={15} /> {selectedFolder.tournamentName}</span> : null}
          </div>
          <div className="folder-detail-header-actions">
            {isFolderOwner && !selectedFolder.parentFolderId ? (
              <label className="folder-visibility-control">
                <span>Visibility</span>
                <select value={folderVisibility(selectedFolder)} disabled={busy} onChange={(event) => void handleVisibilityChange(event.target.value as "public" | "private")}>
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </label>
            ) : isFolderOwner && selectedFolder.parentFolderId
              ? <span className="folder-inherited-visibility"><LockKeyhole size={15} aria-hidden="true" /> {folderVisibility(selectedFolder) === "public" ? "Public" : "Private"} · inherited</span>
              : folderVisibility(selectedFolder) === "public"
              ? <span className="folder-visibility-pill"><FolderOpen size={15} /> Public</span>
              : <span className="folder-visibility-pill"><LockKeyhole size={15} /> Private · shared with you</span>}
            {isFolderOwner ? <button type="button" className="btn btn-ghost folder-delete-button" disabled={busy} onClick={() => void handleDeleteFolder()}><Trash2 size={16} aria-hidden="true" /> Delete folder</button> : null}
          </div>
        </header>

        {message ? <p className="speech-library-status" role="status">{message}</p> : null}
        {parentFolder ? <p className="folder-parent-link"><Folder size={15} aria-hidden="true" /> In <Link to={`/app/folders/${parentFolder.id}`}>{parentFolder.name}</Link></p> : null}

        <section className="app-card folder-board-section" aria-labelledby="folder-board-heading">
          <div className="folder-detail-section-heading">
            <div><p className="eyebrow">Your collection</p><h2 id="folder-board-heading">Board</h2></div>
            <div className="folder-board-heading-actions">
              <span className="meta-line">{boardCards.length} item{boardCards.length === 1 ? "" : "s"}</span>
              {isFolderOwner ? <button type="button" className="btn btn-secondary" onClick={() => { setIsSubfolderFormOpen((value) => !value); setSubfolderNotice(""); }}><Plus size={16} aria-hidden="true" /> {isSubfolderFormOpen ? "Cancel" : "New nested folder"}</button> : null}
              {canEditFolder ? <button type="button" className={isBoardEditing ? "btn btn-primary" : "btn btn-secondary"} disabled={boardLayoutBusy} onClick={toggleBoardEditing}>{isBoardEditing ? <Check size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}{isBoardEditing ? "Done editing" : "Edit board"}</button> : null}
            </div>
          </div>
          {isSubfolderFormOpen && isFolderOwner ? <form className="folder-subfolder-form" onSubmit={(event) => void handleCreateSubfolder(event)}>
            <label className="form-field"><span>Folder name</span><input value={subfolderName} maxLength={60} onChange={(event) => setSubfolderName(event.target.value)} placeholder="e.g. Evidence and briefs" autoFocus /></label>
            <span className="folder-subfolder-visibility"><LockKeyhole size={15} aria-hidden="true" /> {folderVisibility(selectedFolder) === "public" ? "Public" : "Private"} · inherits this folder's visibility</span>
            <button type="submit" className="btn btn-primary" disabled={subfolderBusy}>{subfolderBusy ? "Creating…" : "Create folder here"}</button>
          </form> : null}
          {subfolderNotice ? <p className="meta-line" role="status">{subfolderNotice}</p> : null}
          {boardLayoutNotice ? <p className="folder-board-layout-notice" role="status">{boardLayoutNotice}</p> : null}
          {canEditFolder ? (
            <div className="folder-upload-box">
              <div className="file-input-shell forum-file-input">
                <input ref={fileInputRef} id="folderFiles" type="file" multiple className="file-input-native" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.rtf,.csv,.odt,.ods,.odp" onChange={(event) => setFileDraft(Array.from(event.target.files ?? []))} />
                <label htmlFor="folderFiles" className="file-input-trigger"><Paperclip size={16} aria-hidden="true" /> Add files to board</label>
                <span className={fileDraft.length ? "file-input-name has-file" : "file-input-name"}>{fileDraft.length ? `${fileDraft.length} file${fileDraft.length === 1 ? "" : "s"} selected` : "Images, videos, audio, PDFs, documents, and more · Up to 100 MB each"}</span>
              </div>
              {fileDraft.length ? <div className="folder-selected-files">{fileDraft.map((file) => <span className="forum-mini-pill subtle" key={`${file.name}-${file.size}`}>{file.name}</span>)}</div> : null}
              <button type="button" className="btn btn-primary" disabled={fileBusy || fileDraft.length === 0} onClick={() => void handleUploadFiles()}><Upload size={16} /> {fileBusy ? "Uploading…" : "Upload files"}</button>
              {fileNotice ? <p className="meta-line" role="status">{fileNotice}</p> : null}
            </div>
          ) : null}

          {boardCards.length ? (
            <div className="folder-pinterest-board">
              {visibleBoardCards.map((card) => {
                const cardKey = boardEntryKey(card);
                const dimensions = boardDimensionOverrides[cardKey] ?? { width: boardEntryWidth(card), height: boardEntryHeight(card) ?? null };
                const cardClassName = `folder-board-card${dimensions.height ? " is-height-sized" : ""}${isBoardEditing ? " is-editing" : ""}${activeResizeKey === cardKey ? " is-resizing" : ""}${draggedBoardCardKey === cardKey ? " is-dragging" : ""}`;
                const gapAdjustment = FOLDER_BOARD_GAP_PX * (1 - dimensions.width / 100);
                const cardStyle = {
                  flex: `0 0 calc(${dimensions.width}% - ${gapAdjustment}px)`,
                  ...(dimensions.height ? { height: `${dimensions.height}px` } : {}),
                };
                if (card.kind === "item") {
                  const { item } = card;
                  const copy = getCurrentItemCopy(item);
                  return (
                    <article className={`${cardClassName} folder-board-item`} data-board-card-key={cardKey} style={cardStyle} key={`item-${item.id}`}>
                      <Link className="folder-board-item-link" to={toDetailPath(item)} aria-disabled={isBoardEditing} onClick={(event) => { if (isBoardEditing) event.preventDefault(); }}>
                        <span className="folder-item-icon"><FileText size={19} aria-hidden="true" /></span>
                        <span className="folder-item-type">{itemTypeLabels[item.itemType]}</span>
                        <strong>{copy.title}</strong>
                        {copy.subtitle ? <span className="folder-item-subtitle">{copy.subtitle}</span> : null}
                        <span className="folder-item-summary">{shortText(copy.summary || "No summary has been added yet.")}</span>
                        <span className="folder-board-open">Open item <ChevronRight size={15} aria-hidden="true" /></span>
                      </Link>
                      {renderBoardEditControls(card)}
                    </article>
                  );
                }
                if (card.kind === "folder") {
                  const { folder } = card;
                  const folderItemsCount = (folder.itemCount ?? 0) + (folder.fileCount ?? 0) + allFolders.filter((child) => child.parentFolderId === folder.id).length;
                  return (
                    <article className={`${cardClassName} folder-board-folder`} data-board-card-key={cardKey} style={cardStyle} key={`folder-${folder.id}`}>
                      <Link className="folder-board-folder-link" to={`/app/folders/${folder.id}`} aria-disabled={isBoardEditing} onClick={(event) => { if (isBoardEditing) event.preventDefault(); }}>
                        <span className="folder-item-icon"><FolderOpen size={19} aria-hidden="true" /></span>
                        <span className="folder-item-type">Subfolder</span>
                        <strong>{folder.name}</strong>
                        <span className="folder-item-subtitle">{folderItemsCount} item{folderItemsCount === 1 ? "" : "s"} · {folderVisibility(folder)}</span>
                        {folder.description ? <span className="folder-item-summary">{shortText(folder.description)}</span> : null}
                        <span className="folder-board-open">Open folder <ChevronRight size={15} aria-hidden="true" /></span>
                      </Link>
                      {renderBoardEditControls(card)}
                    </article>
                  );
                }
                const { file } = card;
                const Icon = folderFileIcon(file.kind);
                return (
                  <article className={`${cardClassName} folder-board-file`} data-board-card-key={cardKey} style={cardStyle} key={`file-${file.id}`}>
                    <a href={file.url} target="_blank" rel="noreferrer" className="folder-board-file-link" aria-disabled={isBoardEditing} onClick={(event) => { if (isBoardEditing) event.preventDefault(); }}>
                      {file.kind === "image" ? <img src={file.url} alt={file.name} loading="lazy" /> : file.kind === "video" ? <video src={`${file.url}#t=0.1`} preload="metadata" muted playsInline aria-label={file.name} /> : <span className="folder-file-icon"><Icon size={25} aria-hidden="true" /></span>}
                      <strong>{file.name}</strong><span className="meta-line">{fileSizeLabel(file.size)}</span>
                    </a>
                    {canEditFolder ? <button type="button" className="folder-file-remove" onClick={() => void handleDeleteFile(file)} aria-label={`Remove ${file.name}`}><Trash2 size={15} /></button> : null}
                    {renderBoardEditControls(card)}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="folder-board-empty">
              <FolderOpen size={30} aria-hidden="true" />
              <h3>This board is empty</h3>
              <p>Add speeches, async debates, resources, files, or subfolders to collect them here.</p>
              <div className="button-row"><Link to="/app/speeches/new" className="btn btn-secondary">Browse speeches</Link><Link to="/app/debates" className="btn btn-secondary">Browse async debates</Link><Link to="/app/resources" className="btn btn-secondary">Browse resources</Link></div>
            </div>
          )}
          {selectedFolderItemsState.error ? <p className="folder-error" role="alert">Items could not be loaded: {selectedFolderItemsState.error}</p> : null}
          {selectedFolderFilesState.error ? <p className="folder-error" role="alert">Files could not be loaded: {selectedFolderFilesState.error}</p> : null}
        </section>

        {canEditFolder && currentUser ? (
          <FolderCollaboratorsPanel folder={selectedFolder} currentUser={{ id: currentUser.id, displayName: currentUser.displayName }} />
        ) : null}

        {folderVisibility(selectedFolder) === "public" ? (
          <FolderEngagementBar
            folder={selectedFolder}
            userId={userId}
            reaction={reactionsByFolder.get(selectedFolder.id)}
            isSaved={savedFolderIds.has(selectedFolder.id)}
            commentsExpanded={commentsOpen}
            onOpenComments={() => setCommentsOpen((open) => !open)}
          />
        ) : null}

        {folderVisibility(selectedFolder) === "public" && currentUser ? (
          <FolderCommentsSection
            folder={selectedFolder}
            currentUser={{ id: currentUser.id, displayName: currentUser.displayName }}
            canModerate={isFolderOwner}
            isOpen={commentsOpen}
            onClose={() => setCommentsOpen(false)}
          />
        ) : null}

      </>
    );
  }

  const tournamentOptions = Array.from(new Map(
    allFolders.filter((folder) => folder.tournamentId && folder.tournamentName).map((folder) => [folder.tournamentId!, folder.tournamentName!]),
  ).entries());

  return (
    <>
      <PageMeta title="Folders" description="Search folders, collect debate materials, and share public tournament collections." />
      <header className="route-header">
        <div className="row-between folder-library-heading">
          <div><p className="eyebrow">Your workspace</p><h1>Folders</h1><p>Search your collections and public prep folders. Add debate materials or upload files to keep everything together.</p></div>
          <button type="button" className="btn btn-primary" onClick={openCreateFolder}><Plus size={18} aria-hidden="true" /> New folder</button>
        </div>
      </header>

      {isCreateOpen ? (
        <section className="app-card folder-create-card" aria-label="Create folder">
          <div className="row-between"><div><span className="eyebrow">New collection</span><h2 className="card-title">Create a folder</h2></div><Folder size={22} aria-hidden="true" /></div>
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <div className="form-field"><label htmlFor="folderName">Folder name</label><input id="folderName" value={draftName} maxLength={60} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. State finals prep" /></div>
            <div className="form-field"><label htmlFor="folderVisibility">Visibility</label><select id="folderVisibility" value={draftVisibility} onChange={(event) => setDraftVisibility(event.target.value as "public" | "private")}><option value="private">Private · only you</option><option value="public">Public · visible to everyone</option></select></div>
            <div className="form-field full"><label htmlFor="folderDescription">Description <span className="meta-line">(optional)</span></label><textarea id="folderDescription" maxLength={280} value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} placeholder="What should people know about this collection?" /></div>
            <div className="form-field full"><label htmlFor="folderTournament">Tournament association <span className="meta-line">(optional)</span></label><select id="folderTournament" value={draftTournamentId} onChange={(event) => setDraftTournamentId(event.target.value)}><option value="">No tournament</option>{allEvents.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select>{allEvents.length === 0 ? <span className="meta-line">Sync Tabroom in your profile to associate a tournament.</span> : null}</div>
          </div>
          <div className="button-row folder-form-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleCreateFolder()}>{busy ? "Creating…" : "Create folder"}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={closeCreateFolder}>Cancel</button></div>
          {message ? <p className="meta-line" role="status">{message}</p> : null}
        </section>
      ) : null}
      {message && !isCreateOpen ? <p className="speech-library-status" role="status">{message}</p> : null}
      {foldersState.error || publicFoldersState.error || sharedFoldersState.error || ownerFolderItemsState.error ? <p className="folder-error" role="alert">Folders could not load. {foldersState.error || publicFoldersState.error || sharedFoldersState.error || ownerFolderItemsState.error}</p> : null}
      <FolderInvitesBanner userId={userId} />

      <section className="app-card folder-filter-panel" aria-label="Search folders">
        <label className="forum-search resource-search" htmlFor="folderSearch"><Search size={18} aria-hidden="true" /><input id="folderSearch" type="search" placeholder="Search folders, tournaments, or creators" value={queryText} onChange={(event) => setQueryText(event.target.value)} /></label>
        <details className="speech-filter-details"><summary><SlidersHorizontal size={16} aria-hidden="true" /> Filters</summary><div className="resource-filter-grid">
          <div className="form-field"><label htmlFor="folderVisibilityFilter">Visibility</label><select id="folderVisibilityFilter" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as typeof visibilityFilter)}><option>All</option><option>Public</option><option>Private</option></select></div>
          <div className="form-field"><label htmlFor="folderTournamentFilter">Tournament</label><select id="folderTournamentFilter" value={tournamentFilter} onChange={(event) => setTournamentFilter(event.target.value)}><option value="All">All tournaments</option>{tournamentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
        </div></details>
        <div className="resource-filter-footer"><button type="button" className="btn btn-toggle" aria-pressed={savedOnly} onClick={() => setSavedOnly((value) => !value)}><Bookmark size={16} aria-hidden="true" /> Saved only</button><span className="meta-line">{visibleFolders.length} folder{visibleFolders.length === 1 ? "" : "s"}</span></div>
      </section>

      {foldersState.isLoading && publicFoldersState.isLoading && allFolders.length === 0 ? <section className="app-card folder-empty-state"><p>Loading folders…</p></section> : (
        <section className="speech-library-sections folder-library-sections" aria-label="Folders">
          <article className="app-card folder-library-card" aria-labelledby="your-folders-heading">
            <div className="row-between">
              <h2 className="card-title" id="your-folders-heading">Your folders</h2>
              <span className="meta-line">{myFolders.length}</span>
            </div>
            {myFolders.length ? (
              <div className="folder-library-list">{myFolders.map(renderFolderCard)}</div>
            ) : (
              <div className="folder-library-empty">
                <p className="card-copy">{foldersState.isLoading ? "Loading your folders…" : allFolders.some((folder) => isContentFolderMember(folder, userId)) ? "None of your folders match these filters." : "Create a folder to keep speeches, debates, resources, and files together."}</p>
                <button type="button" className="btn btn-secondary" onClick={openCreateFolder}><Plus size={16} aria-hidden="true" /> New folder</button>
              </div>
            )}
          </article>
          <article className="app-card folder-library-card" aria-labelledby="public-folders-heading">
            <div className="row-between">
              <h2 className="card-title" id="public-folders-heading">Public folders</h2>
              <span className="meta-line">{communityFolders.length}</span>
            </div>
            {communityFolders.length ? (
              <div className="folder-library-list">{communityFolders.map(renderFolderCard)}</div>
            ) : (
              <p className="card-copy">{publicFoldersState.isLoading ? "Loading public folders…" : "No public folders from other members match your search yet."}</p>
            )}
          </article>
        </section>
      )}
    </>
  );
};
