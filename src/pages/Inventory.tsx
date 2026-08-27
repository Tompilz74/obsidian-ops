import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import QRCode from "react-qr-code";

type Option = { id: string; name: string };

type ComponentRow = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  supplier: string | null;
  installed_at: string | null;
  manual_url: string | null;
  notes: string | null;
  status: string;
  critical: boolean;
  tags: string[];

  vessel_id: string | null;
  system_id: string | null;
  department_id: string | null;

  seahub_synced: boolean;
  seahub_synced_at: string | null;
  seahub_ref: string | null;

  vessels?: { name: string }[] | null;
  systems?: { name: string }[] | null;
  departments?: { name: string }[] | null;
};

type PhotoRow = {
  id: string;
  component_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
};

type PendingPhoto = {
  tempPath: string;
  fileName: string;
  previewUrl: string; // local object URL
};

type PartRow = {
  id: string;
  name: string;
  part_number: string;
  quantity: number;
  min_quantity: number;
  supplier: string;
  price: number;
  currency: string;
  lead_time: string;
  notes: string;
  component_ids: string[];
};

type SeaHubInventoryRow = {
  id: string;
  title: string;
  vessel_id: string;
  department_id: string;
  part_number: string;
  make: string;
  related_component_id: string;
  supplier: string;
  quantity: number;
  quantity_units: string;
  min_level: number;
  location: string;
  expiry_date: string;
  critical_status: string;
  cost: number;
  currency: string;
  comments: string;
  image_name: string;
  created_at: string;
};

const statuses = ["active", "spare", "out"] as const;
const partsStorageKey = "obsidian-ops.parts.v1";
const seahubInventoryStorageKey = "obsidian-ops.seahub-inventory.v1";

function fileExt(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

function makeStoragePath(componentId: string, originalName: string) {
  const ext = fileExt(originalName);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${componentId}/${stamp}.${ext}`;
}

function makeDraftPath(draftId: string, originalName: string) {
  const ext = fileExt(originalName);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `drafts/${draftId}/${stamp}.${ext}`;
}

function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function newLocalId(prefix = "local") {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;
}

function readStoredParts() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(partsStorageKey);
    return raw ? (JSON.parse(raw) as PartRow[]) : [];
  } catch {
    return [];
  }
}

function writeStoredParts(parts: PartRow[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(partsStorageKey, JSON.stringify(parts));
}

function readStoredSeaHubInventory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(seahubInventoryStorageKey);
    return raw ? (JSON.parse(raw) as SeaHubInventoryRow[]) : [];
  } catch {
    return [];
  }
}

function writeStoredSeaHubInventory(items: SeaHubInventoryRow[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(seahubInventoryStorageKey, JSON.stringify(items));
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();
    if (m.addEventListener) m.addEventListener("change", onChange);
    else m.addListener(onChange);
    return () => {
      if (m.removeEventListener) m.removeEventListener("change", onChange);
      else m.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/** --------------------- QR helpers --------------------- */

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return c;
    }
  });
}

function getComponentDeepLink(componentId: string) {
  return `${window.location.origin}/?component=${encodeURIComponent(componentId)}`;
}

function printComponentQr(opts: { id: string; name: string }) {
  const link = getComponentDeepLink(opts.id);

  // ✅ Clone the existing QR SVG from THIS page and embed it directly in the print HTML
  let qrSvgHtml = "";
  const svg = document.getElementById("component-qr-svg") as SVGElement | null;
  if (svg) {
    const cloned = svg.cloneNode(true) as SVGElement;
    cloned.removeAttribute("id");
    cloned.setAttribute("width", "240");
    cloned.setAttribute("height", "240");
    cloned.setAttribute("style", "display:block;margin:0 auto;");
    qrSvgHtml = cloned.outerHTML;
  }

  const html = `<!doctype html>
<html>
  <head>
    <title>Print QR</title>
    <meta charset="utf-8" />
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 28px; }
      .card { border: 1px solid #ddd; border-radius: 16px; padding: 20px; text-align: center; }
      h1 { margin: 0 0 8px; font-size: 18px; }
      .sub { font-size: 12px; opacity: .7; margin-bottom: 16px; }
      .link { margin-top: 14px; font-size: 10px; opacity: .75; word-break: break-all; }
      .hint { margin-top: 14px; font-size: 12px; opacity: .75; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(opts.name)}</h1>
      <div class="sub">Obsidian Ops Inventory</div>
      <div id="qr-mount">
        ${
          qrSvgHtml
            ? qrSvgHtml
            : "<div style='opacity:.7'>QR not available (try refresh and open this item again)</div>"
        }
      </div>
      <div class="hint">Scan to open this item</div>
      <div class="link">${escapeHtml(link)}</div>
    </div>

    <script>
      window.onload = () => setTimeout(() => { window.focus(); window.print(); }, 80);
    </script>
  </body>
</html>`;

  const w = window.open("", "_blank", "width=520,height=720");
  if (!w) return;

  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** --------------------- Small UI primitives --------------------- */

function Pill({
  children,
  tone = "neutral",
  uppercase = false,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger" | "success" | "brand" | "muted";
  uppercase?: boolean;
}) {
  const toneStyle =
    tone === "danger"
      ? ui.pillDanger
      : tone === "success"
      ? ui.pillSuccess
      : tone === "brand"
      ? ui.pillBrand
      : tone === "muted"
      ? ui.pillMuted
      : ui.pillNeutral;

  return (
    <span
      style={{
        ...ui.pill,
        ...toneStyle,
        ...(uppercase ? { letterSpacing: "0.14em" } : null),
      }}
    >
      {uppercase ? String(children).toUpperCase() : children}
    </span>
  );
}

function Chip({ text }: { text: string }) {
  return <span style={ui.chip}>{text}</span>;
}

function Field({
  label,
  hint,
  children,
  span = 1,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  span?: 1 | 2;
}) {
  return (
    <div style={{ ...ui.fieldWrap, gridColumn: span === 2 ? "1 / -1" : undefined }}>
      <div style={ui.labelRow}>
        <div style={ui.label}>{label}</div>
        {hint ? <div style={ui.hint}>{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={ui.section}>
      <div style={ui.sectionHeader}>
        <div style={ui.sectionTitle}>{title}</div>
        {right ? <div style={{ marginLeft: "auto" }}>{right}</div> : null}
      </div>
      <div style={ui.sectionBody}>{children}</div>
    </div>
  );
}

type ToastKind = "success" | "error" | "info";

function Toast({
  kind,
  title,
  message,
  onClose,
}: {
  kind: ToastKind;
  title?: string;
  message: string;
  onClose: () => void;
}) {
  const tone = kind === "success" ? ui.toastSuccess : kind === "error" ? ui.toastError : ui.toastInfo;

  return (
    <div style={{ ...ui.toast, ...tone }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={ui.toastDot} />
        <div style={{ flex: 1 }}>
          {title ? <div style={ui.toastTitle}>{title}</div> : null}
          <div style={ui.toastMsg}>{message}</div>
        </div>
        <button onClick={onClose} style={ui.toastClose} aria-label="Close">
          ✕
        </button>
      </div>
    </div>
  );
}

/** --------------------- List row --------------------- */

function ListRow({
  r,
  active,
  onClick,
}: {
  r: ComponentRow;
  active: boolean;
  onClick: () => void;
}) {
  const tags = (r.tags ?? []).filter(Boolean);
  const showTags = tags.slice(0, 2);
  const more = tags.length - showTags.length;

  const vessel = r.vessels?.[0]?.name ?? "";
  const system = r.systems?.[0]?.name ?? "";
  const dept = r.departments?.[0]?.name ?? "";

  return (
    <div onClick={onClick} className="rowHover" style={{ ...ui.row, ...(active ? ui.rowActive : null) }}>
      <div style={ui.rowAccent(active)} />
      <div style={ui.rowGrid}>
        <div style={{ minWidth: 0 }}>
          <div style={ui.rowNameLine}>
            <div style={ui.rowName} title={r.name}>
              {truncate(r.name, 46)}
            </div>
            {r.critical ? <Pill tone="danger">Critical</Pill> : null}
            {r.seahub_synced ? <Pill tone="success">SeaHub</Pill> : null}
          </div>

          <div style={ui.rowSub}>
            {showTags.length ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {showTags.map((t) => (
                  <Chip key={t} text={t} />
                ))}
                {more > 0 ? <span style={ui.moreTag}>+{more}</span> : null}
              </div>
            ) : (
              <span style={ui.mutedSmall}>No tags</span>
            )}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={ui.colTitle}>{r.location ?? "—"}</div>
          <div style={ui.mutedSmall} title={[vessel, system, dept].filter(Boolean).join(" • ")}>
            {[vessel, system, dept].filter(Boolean).join(" • ") || "—"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
          <Pill tone={r.status === "out" ? "danger" : r.status === "spare" ? "muted" : "brand"}>{r.status}</Pill>
          <div style={ui.mutedTiny}>{r.serial_number ? `S/N ${truncate(r.serial_number, 18)}` : "No serial"}</div>
        </div>
      </div>

    </div>
  );
}

/** --------------------- Main --------------------- */

export default function Inventory() {
  const isMobile = useMediaQuery("(max-width: 980px)");
  const [mobileTab, setMobileTab] = useState<"list" | "editor">("list");
  const [appMode, setAppMode] = useState<"equipment" | "parts" | "seahub">("equipment");
  const isMobileEditor = isMobile && mobileTab === "editor";

  const [vessels, setVessels] = useState<Option[]>([]);
  const [systems, setSystems] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [rows, setRows] = useState<ComponentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  // ✅ Draft photos (allow photos before Create)
  const draftIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())
  );
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);

  const [parts, setParts] = useState<PartRow[]>(() => readStoredParts());
  const [partQuery, setPartQuery] = useState("");
  const [partLinkQuery, setPartLinkQuery] = useState("");
  const emptyPartForm = {
    id: "",
    name: "",
    part_number: "",
    quantity: "1",
    min_quantity: "0",
    supplier: "",
    price: "",
    currency: "AUD",
    lead_time: "",
    notes: "",
  };
  const [partForm, setPartForm] = useState({ ...emptyPartForm });

  const emptySeaHubForm = {
    id: "",
    title: "",
    vessel_id: "",
    department_id: "",
    part_number: "",
    make: "",
    related_component_id: "",
    supplier: "",
    quantity: "1",
    quantity_units: "Units",
    min_level: "",
    location: "",
    expiry_date: "",
    critical_status: "",
    cost: "",
    currency: "AUD",
    comments: "",
    image_name: "",
  };
  const [seahubItems, setSeahubItems] = useState<SeaHubInventoryRow[]>(() => readStoredSeaHubInventory());
  const [seahubForm, setSeahubForm] = useState({ ...emptySeaHubForm });
  const [seahubQuery, setSeahubQuery] = useState("");

  const [loading, setLoading] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [vesselId, setVesselId] = useState<string>("all");
  const [systemId, setSystemId] = useState<string>("all");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [seahubFilter, setSeahubFilter] = useState<"all" | "synced" | "unsynced">("all");

  // Toast
  const [toast, setToast] = useState<{ kind: ToastKind; title?: string; message: string } | null>(null);
  const toastTimer = useRef<number | null>(null);
  function showToast(kind: ToastKind, message: string, title?: string) {
    setToast({ kind, message, title });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  // File input
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quickFileInputRef = useRef<HTMLInputElement | null>(null);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [quickName, setQuickName] = useState("");

  // Form
  const emptyForm = {
    id: "" as string | "",
    name: "",
    make: "",
    model: "",
    serial_number: "",
    location: "",
    supplier: "",
    installed_at: "",
    manual_url: "",
    notes: "",
    status: "active",
    critical: false,
    seahub_synced: false,
    seahub_ref: "",
    tagsText: "",
    vessel_id: "",
    system_id: "",
    department_id: "",
  };

  const [form, setForm] = useState({ ...emptyForm });
  const isEditing = Boolean(form.id);

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  const linkedParts = useMemo(
    () => (isEditing ? parts.filter((p) => (p.component_ids ?? []).includes(form.id)) : []),
    [parts, isEditing, form.id]
  );
  const compatiblePartIds = useMemo(() => new Set(linkedParts.map((p) => p.id)), [linkedParts]);
  const visibleParts = useMemo(() => {
    const query = partQuery.trim().toLowerCase();
    return parts
      .filter((p) => {
        if (!query) return true;
        return [p.name, p.part_number, p.supplier, p.lead_time, p.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parts, partQuery]);
  const partLinkRows = useMemo(() => {
    const query = partLinkQuery.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (!query) return true;
        return [r.name, r.make, r.model, r.serial_number, r.location, r.systems?.[0]?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, partLinkQuery]);
  const catalogueValue = useMemo(
    () => parts.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.price) || 0), 0),
    [parts]
  );
  const catalogueLowStock = useMemo(
    () => parts.filter((p) => (Number(p.quantity) || 0) <= (Number(p.min_quantity) || 0)).length,
    [parts]
  );
  const linkedPartsValue = useMemo(
    () => linkedParts.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.price) || 0), 0),
    [linkedParts]
  );
  const lowStockParts = useMemo(
    () => linkedParts.filter((p) => (Number(p.quantity) || 0) <= (Number(p.min_quantity) || 0)),
    [linkedParts]
  );

  const seahubVisibleItems = useMemo(() => {
    const query = seahubQuery.trim().toLowerCase();
    return seahubItems
      .filter((item) => {
        if (!query) return true;
        const vessel = vessels.find((v) => v.id === item.vessel_id)?.name ?? "";
        const department = departments.find((d) => d.id === item.department_id)?.name ?? "";
        const component = rows.find((r) => r.id === item.related_component_id)?.name ?? "";
        return [item.title, item.part_number, item.make, item.supplier, item.location, item.comments, vessel, department, component]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [seahubItems, seahubQuery, vessels, departments, rows]);
  const seahubTotalValue = useMemo(
    () => seahubItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.cost) || 0), 0),
    [seahubItems]
  );
  const seahubLowStock = useMemo(
    () => seahubItems.filter((item) => item.min_level > 0 && item.quantity <= item.min_level).length,
    [seahubItems]
  );

  useEffect(() => {
    writeStoredSeaHubInventory(seahubItems);
  }, [seahubItems]);
  useEffect(() => {
    writeStoredParts(parts);
  }, [parts]);

  // ✅ UX: when you switch tabs on phone, jump to top
  useEffect(() => {
    if (isMobile) window.scrollTo({ top: 0, behavior: "auto" });
  }, [isMobile, mobileTab]);

  // ✅ cleanup local object URLs for pending photos
  useEffect(() => {
    return () => {
      pendingPhotos.forEach((p) => {
        try {
          URL.revokeObjectURL(p.previewUrl);
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureVesselExists(name: string) {
    const chk = await supabase.from("vessels").select("id,name").eq("name", name).maybeSingle();
    if (chk.error) return;
    if (!chk.data) {
      const ins = await supabase.from("vessels").insert({ name }).select("id").single();
      if (ins.error) showToast("info", `Couldn’t auto-create vessel "${name}". Add it in Supabase if needed.`, "Heads up");
    }
  }

  async function loadLookups() {
    await ensureVesselExists("Flying Fish");
    await ensureVesselExists("Gambler");

    const [v, s, d] = await Promise.all([
      supabase.from("vessels").select("id,name").order("name"),
      supabase.from("systems").select("id,name").order("name"),
      supabase.from("departments").select("id,name").order("name"),
    ]);
    if (v.error) throw v.error;
    if (s.error) throw s.error;
    if (d.error) throw d.error;

    setVessels(v.data ?? []);
    setSystems(s.data ?? []);
    setDepartments(d.data ?? []);
  }

  async function loadComponents() {
    setLoading(true);
    try {
      const res = await supabase
        .from("components")
        .select(
          `
          id,
          name,
          make,
          model,
          serial_number,
          location,
          supplier,
          installed_at,
          manual_url,
          notes,
          status,
          critical,
          tags,
          seahub_synced,
          seahub_synced_at,
          seahub_ref,
          vessel_id,
          system_id,
          department_id,
          vessels(name),
          systems(name),
          departments(name)
        `
        )
        .order("updated_at", { ascending: false });

      if (res.error) throw res.error;
      setRows((res.data as ComponentRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadPhotos(componentId: string) {
    const res = await supabase
      .from("component_photos")
      .select("id,component_id,storage_path,caption,sort_order")
      .eq("component_id", componentId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (res.error) throw res.error;
    setPhotos((res.data as PhotoRow[]) ?? []);
  }

  function resetDraft() {
    draftIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());

    pendingPhotos.forEach((p) => {
      try {
        URL.revokeObjectURL(p.previewUrl);
      } catch {}
    });
    setPendingPhotos([]);
  }

  function startAdd() {
    resetDraft();
    setForm({ ...emptyForm });
    setPartForm({ ...emptyPartForm });
    setSelectedId(null);
    setPhotos([]);
    setPhotoUrls({});
    if (isMobile) setMobileTab("editor");
  }

  function openQuickCapture() {
    resetDraft();
    setForm({ ...emptyForm });
    setPartForm({ ...emptyPartForm });
    setSelectedId(null);
    setPhotos([]);
    setPhotoUrls({});
    setQuickName("");
    setAppMode("equipment");
    setQuickCaptureOpen(true);
    if (isMobile) setMobileTab("editor");
    window.setTimeout(() => quickTakePhoto(false), 140);
  }

  function quickTakePhoto(fromLibrary = false) {
    const input = quickFileInputRef.current;
    if (!input) return;
    if (fromLibrary) input.removeAttribute("capture");
    else input.setAttribute("capture", "environment");
    input.click();
  }

  function closeQuickCapture() {
    setQuickCaptureOpen(false);
    setQuickName("");
    resetDraft();
  }

  function startCaptureFirst() {
    openQuickCapture();
  }

  function startEdit(r: ComponentRow) {
    resetDraft();
    setForm({
      id: r.id,
      name: r.name ?? "",
      make: r.make ?? "",
      model: r.model ?? "",
      serial_number: r.serial_number ?? "",
      location: r.location ?? "",
      supplier: r.supplier ?? "",
      installed_at: r.installed_at ?? "",
      manual_url: r.manual_url ?? "",
      notes: r.notes ?? "",
      status: r.status ?? "active",
      critical: Boolean(r.critical),
      seahub_synced: Boolean(r.seahub_synced),
      seahub_ref: r.seahub_ref ?? "",
      tagsText: (r.tags ?? []).join(", "),
      vessel_id: r.vessel_id ?? "",
      system_id: r.system_id ?? "",
      department_id: r.department_id ?? "",
    });
    setSelectedId(r.id);
    setPartForm({ ...emptyPartForm });
    loadPhotos(r.id).catch(console.error);
    if (isMobile) setMobileTab("editor");
  }

  // ✅ Auto-open component when arriving via QR deep link (?component=<id>)
  useEffect(() => {
    if (!rows.length) return;

    const url = new URL(window.location.href);
    const cid = url.searchParams.get("component");
    if (!cid) return;

    const match = rows.find((r) => r.id === cid);
    if (match) {
      startEdit(match);
      if (isMobile) setMobileTab("editor");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Robust move: try .move, otherwise copy+remove
  async function moveObject(bucket: string, from: string, to: string) {
    // @ts-ignore - depending on supabase-js version
    const mv = await supabase.storage.from(bucket).move(from, to);
    if (!mv?.error) return;

    const cp = await supabase.storage.from(bucket).copy(from, to);
    if (cp.error) throw cp.error;

    const rm = await supabase.storage.from(bucket).remove([from]);
    if (rm.error) throw rm.error;
  }

  async function finalizePendingPhotos(componentId: string) {
    if (!pendingPhotos.length) return;

    for (let i = 0; i < pendingPhotos.length; i++) {
      const p = pendingPhotos[i];
      const finalPath = makeStoragePath(componentId, p.fileName);

      await moveObject("component-photos", p.tempPath, finalPath);

      const ins = await supabase
        .from("component_photos")
        .insert({
          component_id: componentId,
          storage_path: finalPath,
          caption: null,
          sort_order: photos.length + i,
        })
        .select("id")
        .single();

      if (ins.error) throw ins.error;
    }

    pendingPhotos.forEach((p) => {
      try {
        URL.revokeObjectURL(p.previewUrl);
      } catch {}
    });
    setPendingPhotos([]);
  }

  async function saveComponent() {
    if (!form.name.trim()) {
      showToast("error", "Component name is required.", "Can’t save");
      return;
    }

    const payload = {
      name: form.name.trim(),
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      serial_number: form.serial_number.trim() || null,
      location: form.location.trim() || null,
      supplier: form.supplier.trim() || null,
      installed_at: form.installed_at || null,
      manual_url: form.manual_url.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
      critical: form.critical,
      tags: form.tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      vessel_id: form.vessel_id || null,
      system_id: form.system_id || null,
      department_id: form.department_id || null,

      seahub_synced: Boolean((form as any).seahub_synced),
      seahub_ref: (((form as any).seahub_ref ?? "") as string).trim() || null,
      seahub_synced_at: (form as any).seahub_synced ? new Date().toISOString() : null,
    };

    setLoading(true);
    try {
      if (isEditing) {
        const res = await supabase.from("components").update(payload).eq("id", form.id).select("id").single();
        if (res.error) throw res.error;

        await finalizePendingPhotos(form.id);
        await loadPhotos(form.id);

        await loadComponents();
        showToast("success", "Component updated.");
      } else {
        const res = await supabase.from("components").insert(payload).select("id").single();
        if (res.error) throw res.error;

        const newId = res.data.id as string;

        await finalizePendingPhotos(newId);
        await loadPhotos(newId);

        await loadComponents();
        setSelectedId(newId);
        setForm((p) => ({ ...p, id: newId }));
        showToast("success", "Component created.");
      }
    } catch (e: any) {
      showToast("error", e.message ?? "Save failed", "Error");
    } finally {
      setLoading(false);
    }
  }

  async function saveQuickCapture() {
    const name = quickName.trim();
    if (!name) {
      showToast("error", "Add a quick name first.", "Can’t save");
      return;
    }

    const payload = {
      name,
      make: null,
      model: null,
      serial_number: null,
      location: null,
      supplier: null,
      installed_at: null,
      manual_url: null,
      notes: null,
      status: "active",
      critical: false,
      tags: [],
      vessel_id: vessels.length === 1 ? vessels[0].id : null,
      system_id: null,
      department_id: null,
      seahub_synced: false,
      seahub_ref: null,
      seahub_synced_at: null,
    };

    setLoading(true);
    try {
      const res = await supabase.from("components").insert(payload).select("id").single();
      if (res.error) throw res.error;

      const newId = res.data.id as string;
      await finalizePendingPhotos(newId);
      await loadPhotos(newId);
      await loadComponents();

      setSelectedId(newId);
      setForm({ ...emptyForm, id: newId, name });
      setQuickCaptureOpen(false);
      setQuickName("");
      if (isMobile) setMobileTab("editor");
      showToast("success", "Quick item added. Details can wait.");
    } catch (e: any) {
      showToast("error", e.message ?? "Quick add failed", "Error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteComponent(id: string) {
    if (!confirm("Delete this component?")) return;
    setLoading(true);
    try {
      const res = await supabase.from("components").delete().eq("id", id);
      if (res.error) throw res.error;
      setParts((current) =>
        current.map((p) => ({ ...p, component_ids: (p.component_ids ?? []).filter((componentId) => componentId !== id) }))
      );
      setForm({ ...emptyForm });
      setSelectedId(null);
      setPhotos([]);
      setPhotoUrls({});
      resetDraft();
      await loadComponents();
      showToast("success", "Component deleted.");
      if (isMobile) setMobileTab("list");
    } catch (e: any) {
      showToast("error", e.message ?? "Delete failed", "Error");
    } finally {
      setLoading(false);
    }
  }

  function resetPartForm() {
    setPartForm({ ...emptyPartForm });
  }

  function resetSeaHubForm() {
    setSeahubForm({ ...emptySeaHubForm });
  }

  function normaliseNumber(value: string) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function savePart() {
    if (!partForm.name.trim()) {
      showToast("error", "Part name is required.", "Can’t save part");
      return;
    }

    const base = {
      name: partForm.name.trim(),
      part_number: partForm.part_number.trim(),
      quantity: normaliseNumber(partForm.quantity),
      min_quantity: normaliseNumber(partForm.min_quantity),
      supplier: partForm.supplier.trim(),
      price: normaliseNumber(partForm.price),
      currency: partForm.currency.trim() || "AUD",
      lead_time: partForm.lead_time.trim(),
      notes: partForm.notes.trim(),
    };

    if (partForm.id) {
      setParts((current) =>
        current.map((p) =>
          p.id === partForm.id
            ? { ...p, ...base, component_ids: Array.from(new Set([...(p.component_ids ?? []), ...(isEditing && appMode === "equipment" ? [form.id] : [])])) }
            : p
        )
      );
      showToast("success", "Part updated.");
    } else {
      setParts((current) => [
        ...current,
        {
          id: newLocalId("part"),
          ...base,
          component_ids: isEditing && appMode === "equipment" ? [form.id] : [],
        },
      ]);
      showToast("success", isEditing && appMode === "equipment" ? "Part added and linked." : "Part added to catalogue.");
    }

    resetPartForm();
  }

  function saveSeaHubItem() {
    if (!seahubForm.title.trim()) {
      showToast("error", "Title is required.", "Can’t save inventory");
      return;
    }
    if (!seahubForm.part_number.trim()) {
      showToast("error", "Part number is required.", "Can’t save inventory");
      return;
    }

    const row: SeaHubInventoryRow = {
      id: seahubForm.id || newLocalId("seahub"),
      title: seahubForm.title.trim(),
      vessel_id: seahubForm.vessel_id,
      department_id: seahubForm.department_id,
      part_number: seahubForm.part_number.trim(),
      make: seahubForm.make.trim(),
      related_component_id: seahubForm.related_component_id,
      supplier: seahubForm.supplier.trim(),
      quantity: normaliseNumber(seahubForm.quantity),
      quantity_units: seahubForm.quantity_units.trim() || "Units",
      min_level: normaliseNumber(seahubForm.min_level),
      location: seahubForm.location.trim(),
      expiry_date: seahubForm.expiry_date,
      critical_status: seahubForm.critical_status,
      cost: normaliseNumber(seahubForm.cost),
      currency: seahubForm.currency.trim() || "AUD",
      comments: seahubForm.comments.trim(),
      image_name: seahubForm.image_name,
      created_at: seahubItems.find((item) => item.id === seahubForm.id)?.created_at ?? new Date().toISOString(),
    };

    setSeahubItems((current) =>
      seahubForm.id ? current.map((item) => (item.id === seahubForm.id ? row : item)) : [row, ...current]
    );
    resetSeaHubForm();
    showToast("success", seahubForm.id ? "SeaHub inventory item updated." : "SeaHub inventory item staged.");
  }

  function editSeaHubItem(item: SeaHubInventoryRow) {
    setSeahubForm({
      id: item.id,
      title: item.title,
      vessel_id: item.vessel_id,
      department_id: item.department_id,
      part_number: item.part_number,
      make: item.make,
      related_component_id: item.related_component_id,
      supplier: item.supplier,
      quantity: String(item.quantity ?? 0),
      quantity_units: item.quantity_units || "Units",
      min_level: item.min_level ? String(item.min_level) : "",
      location: item.location,
      expiry_date: item.expiry_date,
      critical_status: item.critical_status,
      cost: item.cost ? String(item.cost) : "",
      currency: item.currency || "AUD",
      comments: item.comments,
      image_name: item.image_name,
    });
    setAppMode("seahub");
    if (isMobile) setMobileTab("list");
  }

  function deleteSeaHubItem(id: string) {
    if (!confirm("Delete this staged SeaHub inventory item?")) return;
    setSeahubItems((current) => current.filter((item) => item.id !== id));
    if (seahubForm.id === id) resetSeaHubForm();
  }

  function exportSeaHubCsv() {
    const headers = ["Title", "Vessel", "Department", "Part Number", "Make", "Related Component", "Supplier", "Quantity", "Quantity Units", "Minimum Level", "Location", "Expiry Date", "Critical Status", "Cost", "Currency", "Comments", "Image"];
    const csvRows = seahubItems.map((item) => {
      const values = [
        item.title,
        vessels.find((v) => v.id === item.vessel_id)?.name ?? "",
        departments.find((d) => d.id === item.department_id)?.name ?? "",
        item.part_number,
        item.make,
        rows.find((r) => r.id === item.related_component_id)?.name ?? "",
        item.supplier,
        String(item.quantity ?? 0),
        item.quantity_units,
        String(item.min_level ?? 0),
        item.location,
        item.expiry_date,
        item.critical_status,
        String(item.cost ?? 0),
        item.currency,
        item.comments,
        item.image_name,
      ];
      return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seahub-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function editPart(part: PartRow) {
    setPartForm({
      id: part.id,
      name: part.name,
      part_number: part.part_number,
      quantity: String(part.quantity ?? 0),
      min_quantity: String(part.min_quantity ?? 0),
      supplier: part.supplier,
      price: part.price ? String(part.price) : "",
      currency: part.currency || "AUD",
      lead_time: part.lead_time,
      notes: part.notes,
    });
  }

  function linkPart(partId: string) {
    if (!isEditing) return;
    setParts((current) =>
      current.map((p) =>
        p.id === partId ? { ...p, component_ids: Array.from(new Set([...(p.component_ids ?? []), ...(isEditing && appMode === "equipment" ? [form.id] : [])])) } : p
      )
    );
  }

  function unlinkPart(partId: string) {
    setParts((current) =>
      current.map((p) => (p.id === partId ? { ...p, component_ids: (p.component_ids ?? []).filter((id) => id !== form.id) } : p))
    );
  }

  function deletePart(partId: string) {
    if (!confirm("Delete this part from the shared catalogue?")) return;
    setParts((current) => current.filter((p) => p.id !== partId));
    if (partForm.id === partId) resetPartForm();
  }

  function partLinkedComponents(part: PartRow) {
    const ids = new Set(part.component_ids ?? []);
    return rows.filter((r) => ids.has(r.id));
  }

  function togglePartComponent(partId: string, componentId: string) {
    setParts((current) =>
      current.map((p) => {
        if (p.id !== partId) return p;
        const ids = new Set(p.component_ids ?? []);
        if (ids.has(componentId)) ids.delete(componentId);
        else ids.add(componentId);
        return { ...p, component_ids: Array.from(ids) };
      })
    );
  }

  function openPartsMode(part?: PartRow) {
    setAppMode("parts");
    if (part) editPart(part);
    if (isMobile) setMobileTab("list");
  }

  function openSeaHubMode() {
    setAppMode("seahub");
    if (isMobile) setMobileTab("list");
  }
  // ✅ Upload works even without a component id (draft mode)
  async function uploadPhoto(file: File) {
    const componentId = selectedId ?? form.id;

    if (componentId) {
      const path = makeStoragePath(componentId, file.name);

      setLoading(true);
      try {
        const up = await supabase.storage.from("component-photos").upload(path, file, { upsert: false });
        if (up.error) throw up.error;

        const ins = await supabase
          .from("component_photos")
          .insert({ component_id: componentId, storage_path: path, caption: null, sort_order: photos.length })
          .select("id")
          .single();
        if (ins.error) throw ins.error;

        await loadPhotos(componentId);
        showToast("success", "Photo uploaded.");
      } catch (e: any) {
        showToast("error", e.message ?? "Upload failed (check bucket + policies)", "Upload error");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Draft upload
    const draftId = draftIdRef.current;
    const tempPath = makeDraftPath(draftId, file.name);
    const previewUrl = URL.createObjectURL(file);

    setLoading(true);
    try {
      const up = await supabase.storage.from("component-photos").upload(tempPath, file, { upsert: false });
      if (up.error) throw up.error;

      setPendingPhotos((p) => [...p, { tempPath, fileName: file.name, previewUrl }]);
      showToast(
        "success",
        quickCaptureOpen ? "Photo added. Add more or save the quick item." : "Photo added. Hit Create to save it with the component."
      );
    } catch (e: any) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {}
      showToast("error", e.message ?? "Draft upload failed", "Upload error");
    } finally {
      setLoading(false);
    }
  }

  async function getSignedUrl(path: string) {
    const res = await supabase.storage.from("component-photos").createSignedUrl(path, 60 * 60);
    if (res.error) throw res.error;
    return res.data.signedUrl;
  }

  useEffect(() => {
    (async () => {
      const map: Record<string, string> = {};
      for (const p of photos) {
        try {
          map[p.id] = await getSignedUrl(p.storage_path);
        } catch {}
      }
      setPhotoUrls(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map((p) => p.id).join(",")]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (vesselId !== "all" && r.vessel_id !== vesselId) return false;
      if (systemId !== "all" && r.system_id !== systemId) return false;
      if (departmentId !== "all" && r.department_id !== departmentId) return false;
      if (status !== "all" && r.status !== status) return false;
      if (criticalOnly && !r.critical) return false;

      if (seahubFilter === "synced" && !r.seahub_synced) return false;
      if (seahubFilter === "unsynced" && r.seahub_synced) return false;

      if (!query) return true;

      const blob = [
        r.name,
        r.make,
        r.model,
        r.serial_number,
        r.location,
        r.supplier,
        r.vessels?.[0]?.name,
        r.systems?.[0]?.name,
        r.departments?.[0]?.name,
        (r.tags ?? []).join(" "),
        r.seahub_ref ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return blob.includes(query);
    });
  }, [rows, q, vesselId, systemId, departmentId, status, criticalOnly, seahubFilter]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  useEffect(() => {
    (async () => {
      try {
        await loadLookups();
        await loadComponents();
      } catch (e: any) {
        showToast("error", e.message ?? "Load failed", "Error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isMobile) {
      if (selectedId || form.id) setMobileTab("editor");
      else setMobileTab("list");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const total = rows.length;
  const totalCrit = useMemo(() => rows.filter((r) => r.critical).length, [rows]);
  const totalSea = useMemo(() => rows.filter((r) => r.seahub_synced).length, [rows]);
  const totalUnsynced = useMemo(() => rows.filter((r) => !r.seahub_synced).length, [rows]);

  const tagsPreview = useMemo(() => {
    const tags = form.tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return tags;
  }, [form.tagsText]);

  const coverPhoto = photos[0];
  const coverUrl = coverPhoto ? photoUrls[coverPhoto.id] : "";

  const showList = !isMobile || mobileTab === "list";
  const showEditor = !isMobile || mobileTab === "editor";

  // ✅ Choose which “cover” to show in the Photos section:
  const draftCover = pendingPhotos[0]?.previewUrl ?? "";
  const hasAnyPhotos = photos.length > 0 || pendingPhotos.length > 0;

  return (
    <div style={ui.page}>
      <style>{css}</style>

      <div style={ui.toastWrap}>
        {toast ? (
          <Toast kind={toast.kind} title={toast.title} message={toast.message} onClose={() => setToast(null)} />
        ) : null}
      </div>


      {quickCaptureOpen ? (
        <div style={ui.quickOverlay}>
          <div style={ui.quickSheet}>
            <div style={ui.quickGrabber} />
            <div style={ui.quickTopLine}>
              <div>
                <div style={ui.quickTitle}>Quick add</div>
                <div style={ui.quickSub}>Shoot equipment, serial plates, labels, then name it and move on.</div>
              </div>
              <button type="button" className="btn" style={ui.quickClose} onClick={closeQuickCapture}>
                Close
              </button>
            </div>

            <input
              ref={quickFileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files ?? []);
                files.forEach((f) => void uploadPhoto(f));
                e.currentTarget.value = "";
              }}
            />

            <div style={ui.quickCameraRow}>
              <button type="button" className="btn" style={ui.quickCameraBtn} onClick={() => quickTakePhoto(false)} disabled={loading}>
                Take photo
              </button>
              <button type="button" className="btn" style={ui.quickSecondaryBtn} onClick={() => quickTakePhoto(true)} disabled={loading}>
                Library
              </button>
            </div>

            {pendingPhotos.length ? (
              <div style={ui.quickPhotoRail}>
                {pendingPhotos.map((p, index) => (
                  <a key={p.tempPath} href={p.previewUrl} target="_blank" rel="noreferrer" style={ui.quickThumbLink}>
                    <div style={ui.quickThumb}>
                      <img src={p.previewUrl} alt={`Quick capture ${index + 1}`} style={ui.quickThumbImg} />
                      <div style={ui.quickThumbCount}>{index + 1}</div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={ui.quickEmpty}>No photos yet. Tap Take photo and move fast.</div>
            )}

            <label style={ui.quickNameWrap}>
              <span style={ui.quickLabel}>What is it?</span>
              <input
                style={ui.quickNameInput}
                value={quickName}
                autoFocus
                placeholder="Main bilge pump, aft fire extinguisher..."
                onChange={(e) => setQuickName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveQuickCapture();
                }}
              />
            </label>

            <div style={ui.quickFooter}>
              <button type="button" className="btn" style={ui.quickSecondaryBtn} onClick={closeQuickCapture} disabled={loading}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ ...ui.quickSaveBtn, opacity: quickName.trim() ? 1 : 0.55 }}
                onClick={() => void saveQuickCapture()}
                disabled={loading || !quickName.trim()}
              >
                Save quick item
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Top Bar */}
      <div style={{ ...ui.topbar, ...(isMobileEditor ? ui.topbarCompact : null) }}>
        <div style={ui.topbarInner}>
          <div style={ui.brand}>
            <div style={ui.titleRow}>
              <div style={ui.title}>Obsidian Ops</div>
              <Pill tone="brand" uppercase>
                Inventory
              </Pill>
            </div>

            {!isMobileEditor ? (
              <div style={ui.subtitle}>
                <span style={ui.dot} /> {total} total
                <span style={ui.sep}>•</span>
                {totalCrit} critical
                <span style={ui.sep}>•</span>
                {totalSea} SeaHub
                <span style={ui.sep}>•</span>
                {totalUnsynced} not synced
              </div>
            ) : null}
          </div>


          <div style={isMobile ? ui.modeTabsMobile : ui.modeTabs} title="Switch workspace">
            <button
              type="button"
              className="btn"
              onClick={() => setAppMode("equipment")}
              style={{ ...ui.modeTab, ...(appMode === "equipment" ? ui.modeTabActive : null) }}
            >
              Equipment
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setAppMode("parts")}
              style={{ ...ui.modeTab, ...(appMode === "parts" ? ui.modeTabActive : null) }}
            >
              Parts
            </button>
            <button
              type="button"
              className="btn"
              onClick={openSeaHubMode}
              style={{ ...ui.modeTab, ...(appMode === "seahub" ? ui.modeTabActive : null) }}
            >
              SeaHub
            </button>
          </div>

          {isMobile ? (
            isMobileEditor ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
                <button onClick={() => setMobileTab("list")} className="btn" style={ui.btnGhost}>
                  ← List
                </button>
                <button onClick={startCaptureFirst} className="btn" style={ui.btnPrimary}>
                  Quick add
                </button>
                <button onClick={startAdd} className="btn" style={ui.btnGhost}>
                  + Add
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
                <div style={ui.segment} title="Switch view">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setMobileTab("list")}
                    style={{ ...ui.segmentBtn, ...(mobileTab === "list" ? ui.segmentBtnActive : null) }}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setMobileTab("editor")}
                    style={{ ...ui.segmentBtn, ...(mobileTab === "editor" ? ui.segmentBtnActive : null) }}
                  >
                    Editor
                  </button>
                </div>

                <button onClick={startCaptureFirst} className="btn" style={ui.btnPrimary}>
                  Quick add
                </button>
                <button onClick={startAdd} className="btn" style={ui.btnGhost}>
                  + Add
                </button>
              </div>
            )
          ) : (
            <>
              <div style={ui.searchWrap}>
                <input
                  className="field"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search components, tags, serials…"
                  style={{ ...ui.field, minWidth: 320 }}
                />
                {q.trim() ? (
                  <button onClick={() => setQ("")} style={ui.iconBtn} aria-label="Clear search" title="Clear">
                    ✕
                  </button>
                ) : null}
              </div>

              <select className="field" value={vesselId} onChange={(e) => setVesselId(e.target.value)} style={ui.field}>
                <option value="all">All vessels</option>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>

              <select className="field" value={systemId} onChange={(e) => setSystemId(e.target.value)} style={ui.field}>
                <option value="all">All systems</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                className="field"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                style={ui.field}
              >
                <option value="all">All depts</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>

              <select className="field" value={status} onChange={(e) => setStatus(e.target.value)} style={ui.field}>
                <option value="all">All status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <label style={ui.toggle}>
                <input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} />
                <span>Critical</span>
              </label>

              <div style={ui.segment} title="Filter by SeaHub sync status">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSeahubFilter("all")}
                  style={{ ...ui.segmentBtn, ...(seahubFilter === "all" ? ui.segmentBtnActive : null) }}
                >
                  All
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSeahubFilter("synced")}
                  style={{ ...ui.segmentBtn, ...(seahubFilter === "synced" ? ui.segmentBtnActive : null) }}
                >
                  SeaHub
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSeahubFilter("unsynced")}
                  style={{ ...ui.segmentBtn, ...(seahubFilter === "unsynced" ? ui.segmentBtnActive : null) }}
                >
                  Not synced
                </button>
              </div>

              <button onClick={startCaptureFirst} className="btn" style={{ ...ui.btnPrimary, marginLeft: "auto" }}>
                Quick add
              </button>
              <button onClick={startAdd} className="btn" style={ui.btnGhost}>
                + Add
              </button>
              <button onClick={signOut} className="btn" style={ui.btnGhost}>
                Sign out
              </button>
            </>
          )}

          {appMode === "equipment" && isMobile && mobileTab === "list" ? (
            <div style={ui.mobileFilters}>
              <div style={ui.searchWrapMobile}>
                <input
                  className="field"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search components, tags, serials…"
                  style={{ ...ui.field, width: "100%" }}
                />
                {q.trim() ? (
                  <button onClick={() => setQ("")} style={ui.iconBtnMobile} aria-label="Clear search" title="Clear">
                    ✕
                  </button>
                ) : null}
              </div>

              <div style={ui.mobileRow}>
                <select
                  className="field"
                  value={vesselId}
                  onChange={(e) => setVesselId(e.target.value)}
                  style={{ ...ui.field, flex: 1 }}
                >
                  <option value="all">All vessels</option>
                  {vessels.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>

                <select
                  className="field"
                  value={systemId}
                  onChange={(e) => setSystemId(e.target.value)}
                  style={{ ...ui.field, flex: 1 }}
                >
                  <option value="all">All systems</option>
                  {systems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={ui.mobileRow}>
                <select
                  className="field"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  style={{ ...ui.field, flex: 1 }}
                >
                  <option value="all">All depts</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <select
                  className="field"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ ...ui.field, flex: 1 }}
                >
                  <option value="all">All status</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div style={ui.mobileRow}>
                <label style={ui.toggle}>
                  <input type="checkbox" checked={criticalOnly} onChange={(e) => setCriticalOnly(e.target.checked)} />
                  <span>Critical</span>
                </label>

                <div style={{ marginLeft: "auto" }}>
                  <div style={ui.segment} title="Filter by SeaHub sync status">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setSeahubFilter("all")}
                      style={{ ...ui.segmentBtn, ...(seahubFilter === "all" ? ui.segmentBtnActive : null) }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setSeahubFilter("synced")}
                      style={{ ...ui.segmentBtn, ...(seahubFilter === "synced" ? ui.segmentBtnActive : null) }}
                    >
                      SeaHub
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setSeahubFilter("unsynced")}
                      style={{ ...ui.segmentBtn, ...(seahubFilter === "unsynced" ? ui.segmentBtnActive : null) }}
                    >
                      Not synced
                    </button>
                  </div>
                </div>
              </div>

              <div style={ui.mobileRow}>
                <button onClick={signOut} className="btn" style={{ ...ui.btnGhost, width: "100%" }}>
                  Sign out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main */}
      <div style={ui.shell}>
        <div style={isMobile ? ui.commandStripMobile : ui.commandStrip}>
          <button type="button" className="btn" style={ui.commandTile} onClick={() => setAppMode("equipment")}>
            <span style={ui.commandKicker}>Fleet</span>
            <span style={ui.commandValue}>{total}</span>
            <span style={ui.commandLabel}>equipment</span>
          </button>
          <button type="button" className="btn" style={ui.commandTile} onClick={() => setAppMode("parts")}>
            <span style={ui.commandKicker}>Stores</span>
            <span style={ui.commandValue}>{parts.length}</span>
            <span style={ui.commandLabel}>parts</span>
          </button>
          <button type="button" className="btn" style={ui.commandTile} onClick={openSeaHubMode}>
            <span style={ui.commandKicker}>SeaHub</span>
            <span style={ui.commandValue}>{seahubItems.length}</span>
            <span style={ui.commandLabel}>inventory</span>
          </button>
        </div>

        <div style={isMobile ? ui.gridMobile : ui.grid}>
          {appMode === "parts" ? (
            <div style={{ ...ui.card, gridColumn: "1 / -1" }}>
              <div style={ui.partsHero}>
                <div>
                  <div style={ui.overline}>Parts catalogue</div>
                  <div style={ui.partsHeroTitle}>Spares, consumables, suppliers</div>
                  <div style={ui.partsHeroSub}>Create parts once, then link them to every piece of equipment they fit.</div>
                </div>
                <div style={isMobile ? { ...ui.partsHeroStats, gridTemplateColumns: "1fr" } : ui.partsHeroStats}>
                  <div style={ui.metricTile}><div style={ui.metricValue}>{parts.length}</div><div style={ui.metricLabel}>Parts</div></div>
                  <div style={ui.metricTile}><div style={ui.metricValue}>{catalogueLowStock}</div><div style={ui.metricLabel}>Low stock</div></div>
                  <div style={ui.metricTile}><div style={ui.metricValue}>AUD {catalogueValue.toFixed(0)}</div><div style={ui.metricLabel}>Value</div></div>
                </div>
              </div>

              <div style={ui.cardPad}>
                <Section title={partForm.id ? "Edit Part" : "Add Part"} right={<span style={ui.mutedSmall}>Saved on this device</span>}>
                  <div style={isMobile ? ui.formGridMobile : ui.formGrid}>
                    <Field label="Part / consumable" hint="Required">
                      <input className="field" value={partForm.name} onChange={(e) => setPartForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Racor 2020 filter" style={ui.field} />
                    </Field>
                    <Field label="Part number">
                      <input className="field" value={partForm.part_number} onChange={(e) => setPartForm((p) => ({ ...p, part_number: e.target.value }))} placeholder="SKU / OEM / alt number" style={ui.field} />
                    </Field>
                    <Field label="Qty onboard">
                      <input className="field" type="number" min="0" step="1" value={partForm.quantity} onChange={(e) => setPartForm((p) => ({ ...p, quantity: e.target.value }))} style={ui.field} />
                    </Field>
                    <Field label="Minimum qty">
                      <input className="field" type="number" min="0" step="1" value={partForm.min_quantity} onChange={(e) => setPartForm((p) => ({ ...p, min_quantity: e.target.value }))} style={ui.field} />
                    </Field>
                    <Field label="Supplier">
                      <input className="field" value={partForm.supplier} onChange={(e) => setPartForm((p) => ({ ...p, supplier: e.target.value }))} placeholder="e.g. Norship, RS, OEM" style={ui.field} />
                    </Field>
                    <Field label="Price">
                      <div style={{ display: "grid", gridTemplateColumns: "86px 1fr", gap: 8 }}>
                        <input className="field" value={partForm.currency} onChange={(e) => setPartForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} placeholder="AUD" style={ui.field} />
                        <input className="field" type="number" min="0" step="0.01" value={partForm.price} onChange={(e) => setPartForm((p) => ({ ...p, price: e.target.value }))} placeholder="0.00" style={ui.field} />
                      </div>
                    </Field>
                    <Field label="Lead time">
                      <input className="field" value={partForm.lead_time} onChange={(e) => setPartForm((p) => ({ ...p, lead_time: e.target.value }))} placeholder="e.g. 2 weeks" style={ui.field} />
                    </Field>
                    <Field label="Notes" span={2}>
                      <textarea className="field" value={partForm.notes} onChange={(e) => setPartForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Compatible models, storage bin, substitutes, ordering notes" style={{ ...ui.field, minHeight: 82, resize: "vertical", lineHeight: 1.45 }} />
                    </Field>
                  </div>
                  <div style={ui.mobileActionBar}>
                    {partForm.id ? <button type="button" className="btn" style={ui.btnGhost} onClick={resetPartForm}>New part</button> : null}
                    <button type="button" className="btn" style={ui.btnPrimary} onClick={savePart}>{partForm.id ? "Update part" : "Add part"}</button>
                  </div>
                </Section>

                {partForm.id ? (
                  <Section title="Linked Equipment" right={<span style={ui.mutedSmall}>{(parts.find((p) => p.id === partForm.id)?.component_ids ?? []).length} linked</span>}>
                    <input className="field" value={partLinkQuery} onChange={(e) => setPartLinkQuery(e.target.value)} placeholder="Search equipment to link" style={{ ...ui.field, width: "100%", marginBottom: 10 }} />
                    <div style={ui.linkGrid}>
                      {partLinkRows.map((r) => {
                        const checked = (parts.find((p) => p.id === partForm.id)?.component_ids ?? []).includes(r.id);
                        return (
                          <button key={r.id} type="button" className="btn" style={{ ...ui.linkPill, ...(checked ? ui.linkPillActive : null) }} onClick={() => togglePartComponent(partForm.id, r.id)}>
                            <span style={{ fontWeight: 900 }}>{r.name}</span>
                            <span style={ui.mutedTiny}>{r.location || r.systems?.[0]?.name || "No location"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Section>
                ) : null}

                <Section title="Parts List" right={<span style={ui.mutedSmall}>{visibleParts.length} shown</span>}>
                  <input className="field" value={partQuery} onChange={(e) => setPartQuery(e.target.value)} placeholder="Search parts, suppliers, notes" style={{ ...ui.field, width: "100%", marginBottom: 12 }} />
                  <div style={ui.partRows}>
                    {visibleParts.map((part) => {
                      const linked = partLinkedComponents(part);
                      const low = (Number(part.quantity) || 0) <= (Number(part.min_quantity) || 0);
                      return (
                        <div key={part.id} style={isMobile ? { ...ui.catalogPartCard, gridTemplateColumns: "1fr" } : ui.catalogPartCard}>
                          <div style={{ minWidth: 0 }}>
                            <div style={ui.partNameLine}><span style={ui.partName}>{part.name}</span>{low ? <Pill tone="danger">Low</Pill> : null}</div>
                            <div style={ui.mutedSmall}>{[part.part_number || "No part no.", part.supplier || "No supplier", part.lead_time || "No lead time"].join(" • ")}</div>
                            <div style={ui.linkedNames}>{linked.length ? linked.map((r) => r.name).join(" • ") : "Not linked to equipment yet"}</div>
                          </div>
                          <div style={isMobile ? { ...ui.partQtyBlock, textAlign: "left" } : ui.partQtyBlock}>
                            <div style={ui.partQty}>{part.quantity}</div>
                            <div style={ui.mutedTiny}>min {part.min_quantity}</div>
                            <div style={ui.mutedTiny}>{part.currency || "AUD"} {(Number(part.price) || 0).toFixed(2)}</div>
                          </div>
                          <div style={ui.partActions}>
                            <button type="button" className="btn" style={ui.btnPrimary} onClick={() => openPartsMode(part)}>Edit / link</button>
                            <button type="button" className="btn" style={ui.btnDanger} onClick={() => deletePart(part.id)}>Delete</button>
                          </div>
                        </div>
                      );
                    })}
                    {!visibleParts.length ? <div style={ui.photoEmpty}><div style={ui.emptyTitle}>No parts yet.</div><div style={ui.emptySub}>Add a part above, then link it to equipment.</div></div> : null}
                  </div>
                </Section>
              </div>
            </div>
          ) : null}
          {appMode === "seahub" ? (
            <div style={{ ...ui.card, gridColumn: "1 / -1" }}>
              <div style={ui.seahubHero}>
                <div>
                  <div style={ui.overline}>SeaHub inventory staging</div>
                  <div style={ui.partsHeroTitle}>New vessel stock intake</div>
                  <div style={ui.partsHeroSub}>Capture SeaHub-style inventory rows quickly, then export the list when you are ready.</div>
                </div>
                <div style={isMobile ? { ...ui.partsHeroStats, gridTemplateColumns: "1fr" } : ui.partsHeroStats}>
                  <div style={ui.metricTile}><div style={ui.metricValue}>{seahubItems.length}</div><div style={ui.metricLabel}>Items</div></div>
                  <div style={ui.metricTile}><div style={ui.metricValue}>{seahubLowStock}</div><div style={ui.metricLabel}>Low stock</div></div>
                  <div style={ui.metricTile}><div style={ui.metricValue}>AUD {seahubTotalValue.toFixed(0)}</div><div style={ui.metricLabel}>Value</div></div>
                </div>
              </div>

              <div style={ui.cardPad}>
                <Section title={seahubForm.id ? "Edit SeaHub Item" : "Add SeaHub Item"} right={<span style={ui.mutedSmall}>Saved on this device</span>}>
                  <div style={isMobile ? ui.formGridMobile : ui.formGrid}>
                    <Field label="Title" hint="Required">
                      <input className="field" value={seahubForm.title} onChange={(e) => setSeahubForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Oil filter, fire extinguisher" style={ui.field} />
                    </Field>
                    <Field label="Part number" hint="Required">
                      <input className="field" value={seahubForm.part_number} onChange={(e) => setSeahubForm((p) => ({ ...p, part_number: e.target.value }))} placeholder="SKU / OEM / serial if needed" style={ui.field} />
                    </Field>
                    <Field label="Vessel">
                      <select className="field" value={seahubForm.vessel_id} onChange={(e) => setSeahubForm((p) => ({ ...p, vessel_id: e.target.value }))} style={ui.field}>
                        <option value="">- All Vessels -</option>
                        {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Department">
                      <select className="field" value={seahubForm.department_id} onChange={(e) => setSeahubForm((p) => ({ ...p, department_id: e.target.value }))} style={ui.field}>
                        <option value="">- All Departments -</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Make">
                      <input className="field" list="seahub-makes" value={seahubForm.make} onChange={(e) => setSeahubForm((p) => ({ ...p, make: e.target.value }))} placeholder="Maker / brand" style={ui.field} />
                    </Field>
                    <Field label="Related component">
                      <select className="field" value={seahubForm.related_component_id} onChange={(e) => setSeahubForm((p) => ({ ...p, related_component_id: e.target.value }))} style={ui.field}>
                        <option value="">- None -</option>
                        {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Supplier">
                      <input className="field" list="seahub-suppliers" value={seahubForm.supplier} onChange={(e) => setSeahubForm((p) => ({ ...p, supplier: e.target.value }))} placeholder="Supplier" style={ui.field} />
                    </Field>
                    <Field label="Quantity / units">
                      <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr", gap: 8 }}>
                        <input className="field" type="number" min="0" step="1" value={seahubForm.quantity} onChange={(e) => setSeahubForm((p) => ({ ...p, quantity: e.target.value }))} style={ui.field} />
                        <select className="field" value={seahubForm.quantity_units} onChange={(e) => setSeahubForm((p) => ({ ...p, quantity_units: e.target.value }))} style={ui.field}>
                          <option>Units</option>
                          <option>Each</option>
                          <option>Box</option>
                          <option>Pair</option>
                          <option>Litres</option>
                          <option>Metres</option>
                          <option>Kit</option>
                        </select>
                      </div>
                    </Field>
                    <Field label="Minimum level">
                      <input className="field" type="number" min="0" step="1" value={seahubForm.min_level} onChange={(e) => setSeahubForm((p) => ({ ...p, min_level: e.target.value }))} placeholder="Alert level" style={ui.field} />
                    </Field>
                    <Field label="Location">
                      <input className="field" value={seahubForm.location} onChange={(e) => setSeahubForm((p) => ({ ...p, location: e.target.value }))} placeholder="Locker / shelf / bin" style={ui.field} />
                    </Field>
                    <Field label="Expiry date">
                      <input className="field" type="date" value={seahubForm.expiry_date} onChange={(e) => setSeahubForm((p) => ({ ...p, expiry_date: e.target.value }))} style={ui.field} />
                    </Field>
                    <Field label="Critical status">
                      <select className="field" value={seahubForm.critical_status} onChange={(e) => setSeahubForm((p) => ({ ...p, critical_status: e.target.value }))} style={ui.field}>
                        <option value="">- None -</option>
                        <option value="Critical">Critical</option>
                        <option value="Operational">Operational</option>
                        <option value="Consumable">Consumable</option>
                      </select>
                    </Field>
                    <Field label="Cost / currency">
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 82px", gap: 8 }}>
                        <input className="field" type="number" min="0" step="0.01" value={seahubForm.cost} onChange={(e) => setSeahubForm((p) => ({ ...p, cost: e.target.value }))} placeholder="0.00" style={ui.field} />
                        <input className="field" value={seahubForm.currency} onChange={(e) => setSeahubForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} placeholder="AUD" style={ui.field} />
                      </div>
                    </Field>
                    <Field label="Image / photo note">
                      <input className="field" value={seahubForm.image_name} onChange={(e) => setSeahubForm((p) => ({ ...p, image_name: e.target.value }))} placeholder="Photo filename or note" style={ui.field} />
                    </Field>
                    <Field label="Comments" span={2}>
                      <textarea className="field" value={seahubForm.comments} onChange={(e) => setSeahubForm((p) => ({ ...p, comments: e.target.value }))} placeholder="Condition, alternate numbers, anything to check later" style={{ ...ui.field, minHeight: 92, resize: "vertical", lineHeight: 1.45 }} />
                    </Field>
                  </div>
                  <datalist id="seahub-makes">
                    {Array.from(new Set(rows.map((r) => r.make).filter(Boolean) as string[])).map((make) => <option key={make} value={make} />)}
                  </datalist>
                  <datalist id="seahub-suppliers">
                    {Array.from(new Set([...parts.map((p) => p.supplier), ...rows.map((r) => r.supplier)].filter(Boolean) as string[])).map((supplier) => <option key={supplier} value={supplier} />)}
                  </datalist>
                  <div style={ui.mobileActionBar}>
                    {seahubForm.id ? <button type="button" className="btn" style={ui.btnGhost} onClick={resetSeaHubForm}>New item</button> : null}
                    <button type="button" className="btn" style={ui.btnPrimary} onClick={saveSeaHubItem}>{seahubForm.id ? "Update item" : "Add inventory item"}</button>
                  </div>
                </Section>

                <Section title="SeaHub Inventory List" right={<span style={ui.mutedSmall}>{seahubVisibleItems.length} shown</span>}>
                  <div style={isMobile ? { ...ui.seahubListTools, gridTemplateColumns: "1fr" } : ui.seahubListTools}>
                    <input className="field" value={seahubQuery} onChange={(e) => setSeahubQuery(e.target.value)} placeholder="Search title, part no., supplier, location" style={{ ...ui.field, width: "100%" }} />
                    <button type="button" className="btn" style={ui.btnGhost} onClick={exportSeaHubCsv} disabled={!seahubItems.length}>Export CSV</button>
                  </div>
                  <div style={ui.partRows}>
                    {seahubVisibleItems.map((item) => {
                      const vessel = vessels.find((v) => v.id === item.vessel_id)?.name ?? "No vessel";
                      const department = departments.find((d) => d.id === item.department_id)?.name ?? "No department";
                      const component = rows.find((r) => r.id === item.related_component_id)?.name ?? "No component";
                      const low = item.min_level > 0 && item.quantity <= item.min_level;
                      return (
                        <div key={item.id} style={isMobile ? { ...ui.seahubItemCard, gridTemplateColumns: "1fr" } : ui.seahubItemCard}>
                          <div style={{ minWidth: 0 }}>
                            <div style={ui.partNameLine}><span style={ui.partName}>{item.title}</span>{low ? <Pill tone="danger">Low</Pill> : null}{item.critical_status ? <Pill tone={item.critical_status === "Critical" ? "danger" : "muted"}>{item.critical_status}</Pill> : null}</div>
                            <div style={ui.mutedSmall}>{[item.part_number, item.make || "No make", item.supplier || "No supplier"].join(" • ")}</div>
                            <div style={ui.linkedNames}>{[vessel, department, component, item.location || "No location"].join(" • ")}</div>
                          </div>
                          <div style={isMobile ? { ...ui.partQtyBlock, textAlign: "left" } : ui.partQtyBlock}>
                            <div style={ui.partQty}>{item.quantity} {item.quantity_units}</div>
                            <div style={ui.mutedTiny}>min {item.min_level || 0}</div>
                            <div style={ui.mutedTiny}>{item.currency || "AUD"} {(Number(item.cost) || 0).toFixed(2)}</div>
                          </div>
                          <div style={ui.partActions}>
                            <button type="button" className="btn" style={ui.btnPrimary} onClick={() => editSeaHubItem(item)}>Edit</button>
                            <button type="button" className="btn" style={ui.btnDanger} onClick={() => deleteSeaHubItem(item.id)}>Delete</button>
                          </div>
                        </div>
                      );
                    })}
                    {!seahubVisibleItems.length ? <div style={ui.photoEmpty}><div style={ui.emptyTitle}>No SeaHub inventory staged yet.</div><div style={ui.emptySub}>Add the first item above, then keep moving through the vessel.</div></div> : null}
                  </div>
                </Section>
              </div>
            </div>
          ) : null}          {/* List */}
          {appMode === "equipment" && showList ? (
            <div style={ui.card}>
              <div style={ui.cardHeader}>
                <div style={ui.h}>Components</div>
                <div style={ui.muted}>{filtered.length} shown</div>
                <div style={{ marginLeft: "auto" }}>{loading ? <div style={ui.muted}>Working…</div> : null}</div>
              </div>

              <div style={ui.list}>
                <div style={ui.tableHead}>
                  <div style={ui.tableHeadGrid}>
                    <div style={ui.tableHeadLabel}>Component</div>
                    <div style={ui.tableHeadLabel}>Location</div>
                    <div style={{ ...ui.tableHeadLabel, textAlign: "right" }}>Status</div>
                  </div>
                </div>

                <div style={ui.rowsWrap}>
                  {filtered.map((r) => (
                    <ListRow key={r.id} r={r} active={r.id === selectedId} onClick={() => startEdit(r)} />
                  ))}

                  {!filtered.length ? (
                    <div style={ui.emptyList}>
                      <div style={ui.emptyTitle}>Nothing matches your filters.</div>
                      <div style={ui.emptySub}>Try clearing search or widening filters.</div>
                      <button
                        onClick={() => {
                          setQ("");
                          setVesselId("all");
                          setSystemId("all");
                          setDepartmentId("all");
                          setStatus("all");
                          setCriticalOnly(false);
                          setSeahubFilter("all");
                        }}
                        style={ui.btnGhost}
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Editor */}
          {appMode === "equipment" && showEditor ? (
            <div style={ui.card}>
              <div style={ui.editorTop}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={ui.editorTitleLine}>
                    <div style={ui.editorTitle} title={form.name || (isEditing ? "Edit Component" : "New Component")}>
                      {form.name?.trim()
                        ? truncate(form.name.trim(), isMobile ? 28 : 44)
                        : isEditing
                        ? "Edit Component"
                        : "New Component"}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Pill tone={form.status === "out" ? "danger" : form.status === "spare" ? "muted" : "brand"}>
                        {form.status}
                      </Pill>
                      {form.critical ? <Pill tone="danger">Critical</Pill> : null}
                      {form.seahub_synced ? <Pill tone="success">SeaHub</Pill> : null}
                    </div>
                  </div>

                  <div style={ui.editorMeta}>
                    {isEditing ? (
                      <>
                        <span style={ui.metaKey}>ID</span> <span style={ui.metaVal}>{form.id}</span>
                        {selectedRow?.seahub_ref ? (
                          <>
                            <span style={ui.sep}>•</span>
                            <span style={ui.metaKey}>SeaHub Ref</span>{" "}
                            <span style={ui.metaVal}>{selectedRow.seahub_ref}</span>
                          </>
                        ) : null}
                      </>
                    ) : pendingPhotos.length ? (
                      <span style={ui.mutedSmall}>
                        {pendingPhotos.length} photo(s) staged — hit <b>Create</b> to save them with this component.
                      </span>
                    ) : (
                      <span style={ui.mutedSmall}>Add details + photos, then hit Create.</span>
                    )}
                  </div>
                </div>

                <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {!isMobile ? null : (
                    <button onClick={() => setMobileTab("list")} className="btn" style={ui.btnGhost} title="Back to list">
                      ← List
                    </button>
                  )}

                  {isEditing ? (
                    <button onClick={() => deleteComponent(form.id)} className="btn" style={ui.btnDanger}>
                      Delete
                    </button>
                  ) : null}

                  <button onClick={saveComponent} className="btn" style={ui.btnPrimary}>
                    {isEditing ? "Save" : "Create"}
                  </button>
                </div>
              </div>

              <div style={ui.cardPad}>
                <Section title="Identity">
                  <div style={isMobile ? ui.formGridMobile : ui.formGrid}>
                    <Field label="Component name" hint="Required">
                      <input
                        className="field"
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Chiller seawater pump"
                        style={ui.field}
                      />
                    </Field>

                    <Field label="Status">
                      <select
                        className="field"
                        value={form.status}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                        style={ui.field}
                      >
                        {statuses.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Make">
                      <input
                        className="field"
                        value={form.make}
                        onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))}
                        placeholder="e.g. Jabsco"
                        style={ui.field}
                      />
                    </Field>

                    <Field label="Model">
                      <input
                        className="field"
                        value={form.model}
                        onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                        placeholder="e.g. 31640-0092"
                        style={ui.field}
                      />
                    </Field>

                    <Field label="Serial number">
                      <input
                        className="field"
                        value={form.serial_number}
                        onChange={(e) => setForm((p) => ({ ...p, serial_number: e.target.value }))}
                        placeholder="Optional"
                        style={ui.field}
                      />
                    </Field>

                    <Field label="Location">
                      <input
                        className="field"
                        value={form.location}
                        onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                        placeholder="e.g. ER port side"
                        style={ui.field}
                      />
                    </Field>
                  </div>
                </Section>

                <Section title="Placement">
                  <div style={isMobile ? ui.formGridMobile : ui.formGrid}>
                    <Field label="Vessel">
                      <select
                        className="field"
                        value={form.vessel_id}
                        onChange={(e) => setForm((p) => ({ ...p, vessel_id: e.target.value }))}
                        style={ui.field}
                      >
                        <option value="">Optional</option>
                        {vessels.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="System">
                      <select
                        className="field"
                        value={form.system_id}
                        onChange={(e) => setForm((p) => ({ ...p, system_id: e.target.value }))}
                        style={ui.field}
                      >
                        <option value="">Optional</option>
                        {systems.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Department">
                      <select
                        className="field"
                        value={form.department_id}
                        onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}
                        style={ui.field}
                      >
                        <option value="">Optional</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Supplier">
                      <input
                        className="field"
                        value={form.supplier}
                        onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
                        placeholder="Optional"
                        style={ui.field}
                      />
                    </Field>

                    <Field label="Installed date">
                      <input
                        className="field"
                        type="date"
                        value={form.installed_at}
                        onChange={(e) => setForm((p) => ({ ...p, installed_at: e.target.value }))}
                        style={ui.field}
                      />
                    </Field>

                    <Field label="Manual URL" hint="Paste link when available" span={2}>
                      <input
                        className="field"
                        value={form.manual_url}
                        onChange={(e) => setForm((p) => ({ ...p, manual_url: e.target.value }))}
                        placeholder="https://…"
                        style={ui.field}
                      />
                    </Field>
                  </div>
                </Section>

                <Section
                  title="Tags & Notes"
                  right={
                    tagsPreview.length ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {tagsPreview.slice(0, 5).map((t) => (
                          <Chip key={t} text={t} />
                        ))}
                        {tagsPreview.length > 5 ? <span style={ui.moreTag}>+{tagsPreview.length - 5}</span> : null}
                      </div>
                    ) : (
                      <span style={ui.mutedSmall}>No tags yet</span>
                    )
                  }
                >
                  <div style={isMobile ? ui.formGridMobile : ui.formGrid}>
                    <Field label="Tags" hint="Comma separated" span={2}>
                      <input
                        className="field"
                        value={form.tagsText}
                        onChange={(e) => setForm((p) => ({ ...p, tagsText: e.target.value }))}
                        placeholder="e.g. HVAC, critical-path, spares"
                        style={ui.field}
                      />
                    </Field>

                    <Field label="Notes" span={2}>
                      <textarea
                        className="field"
                        value={form.notes}
                        onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                        placeholder="Add service notes, observations, part numbers, etc."
                        style={{ ...ui.field, minHeight: 110, resize: "vertical", lineHeight: 1.45 }}
                      />
                    </Field>
                  </div>
                </Section>

                <Section
                  title="Shared Parts"
                  right={
                    isEditing ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Pill tone="brand">{linkedParts.length} linked</Pill>
                        {lowStockParts.length ? <Pill tone="danger">{lowStockParts.length} low</Pill> : null}
                        <Pill tone="muted">AUD {linkedPartsValue.toFixed(2)}</Pill>
                      </div>
                    ) : (
                      <span style={ui.mutedSmall}>Create first</span>
                    )
                  }
                >
                  {!isEditing ? (
                    <div style={ui.photoEmpty}>
                      <div style={ui.emptyTitle}>Create the component to link shared spares and consumables.</div>
                      <div style={ui.emptySub}>
                        Parts live in a shared catalogue, so the same filter, belt, impeller, oil, or kit can be linked to multiple pieces of equipment.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={isMobile ? { ...ui.partsSummary, gridTemplateColumns: "1fr" } : ui.partsSummary}>
                        <div style={ui.metricTile}>
                          <div style={ui.metricValue}>{linkedParts.length}</div>
                          <div style={ui.metricLabel}>Compatible</div>
                        </div>
                        <div style={ui.metricTile}>
                          <div style={ui.metricValue}>{lowStockParts.length}</div>
                          <div style={ui.metricLabel}>At or below min</div>
                        </div>
                        <div style={ui.metricTile}>
                          <div style={ui.metricValue}>AUD {linkedPartsValue.toFixed(0)}</div>
                          <div style={ui.metricLabel}>Stock value</div>
                        </div>
                      </div>

                      <div style={ui.partFormPanel}>
                        <div style={isMobile ? ui.formGridMobile : ui.formGrid}>
                          <Field label="Part / consumable" hint="Shared catalogue">
                            <input
                              className="field"
                              value={partForm.name}
                              onChange={(e) => setPartForm((p) => ({ ...p, name: e.target.value }))}
                              placeholder="e.g. Racor 2020 filter"
                              style={ui.field}
                            />
                          </Field>

                          <Field label="Part number">
                            <input
                              className="field"
                              value={partForm.part_number}
                              onChange={(e) => setPartForm((p) => ({ ...p, part_number: e.target.value }))}
                              placeholder="SKU / OEM / alt number"
                              style={ui.field}
                            />
                          </Field>

                          <Field label="Qty onboard">
                            <input
                              className="field"
                              type="number"
                              min="0"
                              step="1"
                              value={partForm.quantity}
                              onChange={(e) => setPartForm((p) => ({ ...p, quantity: e.target.value }))}
                              style={ui.field}
                            />
                          </Field>

                          <Field label="Minimum qty">
                            <input
                              className="field"
                              type="number"
                              min="0"
                              step="1"
                              value={partForm.min_quantity}
                              onChange={(e) => setPartForm((p) => ({ ...p, min_quantity: e.target.value }))}
                              style={ui.field}
                            />
                          </Field>

                          <Field label="Supplier">
                            <input
                              className="field"
                              value={partForm.supplier}
                              onChange={(e) => setPartForm((p) => ({ ...p, supplier: e.target.value }))}
                              placeholder="e.g. Norship, RS, OEM"
                              style={ui.field}
                            />
                          </Field>

                          <Field label="Price">
                            <div style={{ display: "grid", gridTemplateColumns: "86px 1fr", gap: 8 }}>
                              <input
                                className="field"
                                value={partForm.currency}
                                onChange={(e) => setPartForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                                placeholder="AUD"
                                style={ui.field}
                              />
                              <input
                                className="field"
                                type="number"
                                min="0"
                                step="0.01"
                                value={partForm.price}
                                onChange={(e) => setPartForm((p) => ({ ...p, price: e.target.value }))}
                                placeholder="0.00"
                                style={ui.field}
                              />
                            </div>
                          </Field>

                          <Field label="Lead time">
                            <input
                              className="field"
                              value={partForm.lead_time}
                              onChange={(e) => setPartForm((p) => ({ ...p, lead_time: e.target.value }))}
                              placeholder="e.g. 2 weeks"
                              style={ui.field}
                            />
                          </Field>

                          <Field label="Notes" span={2}>
                            <textarea
                              className="field"
                              value={partForm.notes}
                              onChange={(e) => setPartForm((p) => ({ ...p, notes: e.target.value }))}
                              placeholder="Compatible models, storage bin, substitutes, ordering notes"
                              style={{ ...ui.field, minHeight: 76, resize: "vertical", lineHeight: 1.45 }}
                            />
                          </Field>
                        </div>

                        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
                          {partForm.id ? (
                            <button type="button" className="btn" style={ui.btnGhost} onClick={resetPartForm}>
                              Clear
                            </button>
                          ) : null}
                          <button type="button" className="btn" style={ui.btnPrimary} onClick={savePart}>
                            {partForm.id ? "Update part" : "Add shared part"}
                          </button>
                        </div>
                      </div>

                      <div style={ui.partCatalog}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 950 }}>Catalogue</div>
                          <div style={ui.mutedSmall}>{parts.length} saved locally</div>
                          <input
                            className="field"
                            value={partQuery}
                            onChange={(e) => setPartQuery(e.target.value)}
                            placeholder="Search parts, suppliers, notes"
                            style={{ ...ui.field, marginLeft: "auto", minWidth: isMobile ? "100%" : 260 }}
                          />
                        </div>

                        <div style={ui.partRows}>
                          {visibleParts.map((part) => {
                            const linked = compatiblePartIds.has(part.id);
                            const low = (Number(part.quantity) || 0) <= (Number(part.min_quantity) || 0);
                            return (
                              <div key={part.id} style={isMobile ? { ...ui.partRow, gridTemplateColumns: "1fr", alignItems: "stretch" } : ui.partRow}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={ui.partNameLine}>
                                    <span style={ui.partName}>{part.name}</span>
                                    {linked ? <Pill tone="brand">Fits this</Pill> : null}
                                    {low ? <Pill tone="danger">Low</Pill> : null}
                                  </div>
                                  <div style={ui.mutedSmall}>
                                    {[part.part_number || "No part no.", part.supplier || "No supplier", part.lead_time || "No lead time"]
                                      .filter(Boolean)
                                      .join(" • ")}
                                  </div>
                                  <div style={ui.mutedTiny}>
                                    Linked to {(part.component_ids ?? []).length} component{(part.component_ids ?? []).length === 1 ? "" : "s"}
                                  </div>
                                </div>

                                <div style={isMobile ? { ...ui.partQtyBlock, textAlign: "left" } : ui.partQtyBlock}>
                                  <div style={ui.partQty}>{part.quantity}</div>
                                  <div style={ui.mutedTiny}>min {part.min_quantity}</div>
                                  <div style={ui.mutedTiny}>
                                    {part.currency || "AUD"} {(Number(part.price) || 0).toFixed(2)}
                                  </div>
                                </div>

                                <div style={ui.partActions}>
                                  {linked ? (
                                    <button type="button" className="btn" style={ui.btnGhost} onClick={() => unlinkPart(part.id)}>
                                      Unlink
                                    </button>
                                  ) : (
                                    <button type="button" className="btn" style={ui.btnPrimary} onClick={() => linkPart(part.id)}>
                                      Link
                                    </button>
                                  )}
                                  <button type="button" className="btn" style={ui.btnGhost} onClick={() => editPart(part)}>
                                    Edit
                                  </button>
                                  <button type="button" className="btn" style={ui.btnDanger} onClick={() => deletePart(part.id)}>
                                    Delete
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {!visibleParts.length ? (
                            <div style={ui.photoEmpty}>
                              <div style={ui.emptyTitle}>No parts in the catalogue yet.</div>
                              <div style={ui.emptySub}>Add the first shared spare or consumable above.</div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </Section>
                <Section title="SeaHub">
                  <div style={ui.seahubRow}>
                    <label style={ui.toggleLarge}>
                      <input
                        type="checkbox"
                        checked={form.seahub_synced}
                        onChange={(e) => setForm((p) => ({ ...p, seahub_synced: e.target.checked }))}
                      />
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 850 }}>Synced to SeaHub</span>
                        <span style={ui.mutedSmall}>Use this to flag items already mirrored in SeaHub.</span>
                      </div>
                    </label>

                    <div style={{ flex: 1, minWidth: 240 }}>
                      <Field label="SeaHub reference" hint="Optional">
                        <input
                          className="field"
                          value={form.seahub_ref}
                          onChange={(e) => setForm((p) => ({ ...p, seahub_ref: e.target.value }))}
                          placeholder="e.g. SH-INV-01923"
                          style={ui.field}
                        />
                      </Field>
                    </div>
                  </div>
                </Section>

                {/* ✅ QR section */}
                {isEditing ? (
                  <Section
                    title="QR Code"
                    right={
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          className="btn"
                          style={ui.btnGhost}
                          onClick={async () => {
                            try {
                              const link = getComponentDeepLink(form.id);
                              if (navigator.clipboard?.writeText) {
                                await navigator.clipboard.writeText(link);
                                showToast("success", "Link copied.");
                              } else {
                                showToast("info", "Clipboard not available in this browser.");
                              }
                            } catch {
                              showToast("error", "Couldn’t copy link.", "Error");
                            }
                          }}
                          title="Copy deep link"
                        >
                          Copy link
                        </button>

                        <button
                          className="btn"
                          style={ui.btnPrimary}
                          onClick={() => printComponentQr({ id: form.id, name: form.name || "Component" })}
                          title="Print QR label"
                        >
                          Print QR
                        </button>
                      </div>
                    }
                  >
                    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                      <div
                        style={{
                          width: 160,
                          height: 160,
                          padding: 10,
                          borderRadius: 16,
                          border: "1px solid rgba(2,6,23,0.10)",
                          background: "rgba(255,255,255,0.85)",
                        }}
                        title="Scan to open this component"
                      >
                        <QRCode id="component-qr-svg" value={getComponentDeepLink(form.id)} size={140} />
                      </div>

                      <div style={{ minWidth: 240, flex: 1 }}>
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>Scan to open this item</div>
                        <div style={{ ...ui.mutedSmall, wordBreak: "break-all" }}>{getComponentDeepLink(form.id)}</div>
                        <div style={{ ...ui.mutedTiny, marginTop: 8 }}>
                          Tip: print and stick this on the equipment — scanning jumps straight into Obsidian Ops.
                        </div>
                      </div>
                    </div>
                  </Section>
                ) : (
                  <Section title="QR Code">
                    <div style={ui.photoEmpty}>
                      <div style={ui.emptyTitle}>Create the component to generate its QR code.</div>
                      <div style={ui.emptySub}>Once created, you can print a label that opens this item instantly.</div>
                    </div>
                  </Section>
                )}

                {/* Photos */}
                <Section
                  title="Photos"
                  right={
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.setAttribute("capture", "environment");
                            fileInputRef.current.click();
                          }
                        }}
                        className="btn"
                        style={ui.btnPrimary}
                        title="Take photo"
                      >
                        Take photo
                      </button>

                      <button
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.removeAttribute("capture");
                            fileInputRef.current.click();
                          }
                        }}
                        className="btn"
                        style={ui.btnGhost}
                        title="Choose from library"
                      >
                        Library
                      </button>
                    </div>
                  }
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadPhoto(f);
                      e.currentTarget.value = "";
                    }}
                  />

                  {!hasAnyPhotos ? (
                    <div style={ui.photoEmpty}>
                      <div style={ui.emptyTitle}>No photos yet.</div>
                      <div style={ui.emptySub}>Take a quick ID shot — you can save it when you hit Create.</div>
                    </div>
                  ) : (
                    <div style={isMobile ? ui.photoLayoutMobile : ui.photoLayout}>
                      <a
                        href={coverUrl || draftCover}
                        target="_blank"
                        rel="noreferrer"
                        style={{ textDecoration: "none", display: "block" }}
                        title="Open cover photo"
                      >
                        <div style={ui.coverCard} className="photoHover">
                          {coverUrl || draftCover ? (
                            <img
                              src={coverUrl || draftCover}
                              alt="Cover"
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <div style={ui.photoLoading}>Loading…</div>
                          )}
                          <div style={ui.coverOverlay}>
                            <div style={ui.coverTitle}>{photos.length ? "Cover" : "Draft"}</div>
                            <div style={ui.coverSub}>{(photos.length || 0) + (pendingPhotos.length || 0)} photos</div>
                          </div>
                        </div>
                      </a>

                      <div style={ui.photoGridMobile}>
                        {/* saved photos (skip cover) */}
                        {photos.slice(1).map((p) => (
                          <a
                            key={p.id}
                            href={photoUrls[p.id]}
                            target="_blank"
                            rel="noreferrer"
                            style={{ textDecoration: "none" }}
                            title="Open photo"
                          >
                            <div style={ui.photoCard} className="photoHover">
                              {photoUrls[p.id] ? (
                                <img
                                  src={photoUrls[p.id]}
                                  alt={p.caption ?? "Component photo"}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <div style={ui.photoLoading}>Loading…</div>
                              )}
                            </div>
                          </a>
                        ))}

                        {/* draft photos (skip draft cover when there are no saved photos) */}
                        {pendingPhotos.slice(photos.length ? 0 : 1).map((p) => (
                          <a
                            key={p.tempPath}
                            href={p.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ textDecoration: "none" }}
                            title="Draft photo"
                          >
                            <div style={ui.photoCard} className="photoHover">
                              <img
                                src={p.previewUrl}
                                alt="Draft"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {isMobile ? (
        <div style={ui.bottomDock}>
          <button type="button" className="btn" style={{ ...ui.dockBtn, ...(appMode === "equipment" ? ui.dockBtnActive : null) }} onClick={() => setAppMode("equipment")}>
            <span style={ui.dockIcon}>EQ</span>
            <span>Equipment</span>
          </button>
          <button type="button" className="btn" style={{ ...ui.dockBtn, ...(appMode === "parts" ? ui.dockBtnActive : null) }} onClick={() => setAppMode("parts")}>
            <span style={ui.dockIcon}>PT</span>
            <span>Parts</span>
          </button>
          <button type="button" className="btn" style={{ ...ui.dockBtn, ...(appMode === "seahub" ? ui.dockBtnActive : null) }} onClick={openSeaHubMode}>
            <span style={ui.dockIcon}>SH</span>
            <span>SeaHub</span>
          </button>
          <button type="button" className="btn" style={ui.dockAction} onClick={startCaptureFirst}>
            Quick add
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** --------------------- Styles --------------------- */

const ui = {
  page: {
    fontFamily: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`,
    color: "#0B0F14",
    background:
      "linear-gradient(135deg, rgba(12,74,110,0.10) 0%, transparent 34%)," +
      "radial-gradient(900px 520px at 92% 8%, rgba(20,184,166,0.16), transparent 55%)," +
      "radial-gradient(760px 440px at 4% 92%, rgba(245,158,11,0.10), transparent 56%)," +
      "linear-gradient(180deg, #F3F7F8 0%, #E9EEF0 100%)",
    minHeight: "100vh",
  } as React.CSSProperties,

  toastWrap: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 100,
    pointerEvents: "none",
  } as React.CSSProperties,

  toast: {
    width: 360,
    borderRadius: 16,
    padding: 14,
    border: "1px solid rgba(2,6,23,0.12)",
    background: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 10px 30px rgba(2,6,23,0.16)",
    pointerEvents: "auto",
  } as React.CSSProperties,

  toastSuccess: { borderColor: "rgba(16,185,129,0.25)" } as React.CSSProperties,
  toastError: { borderColor: "rgba(239,68,68,0.25)" } as React.CSSProperties,
  toastInfo: { borderColor: "rgba(59,130,246,0.25)" } as React.CSSProperties,
  toastDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
    background: "rgba(2,6,23,0.35)",
  } as React.CSSProperties,
  toastTitle: { fontWeight: 900, letterSpacing: "-0.01em" } as React.CSSProperties,
  toastMsg: { marginTop: 2, fontSize: 13, opacity: 0.82, lineHeight: 1.35 } as React.CSSProperties,
  toastClose: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    opacity: 0.55,
    fontSize: 14,
    padding: 4,
  } as React.CSSProperties,

  quickOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 120,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: "12px 12px calc(12px + env(safe-area-inset-bottom))",
    background: "rgba(2,6,23,0.52)",
    backdropFilter: "blur(8px)",
  } as React.CSSProperties,
  quickSheet: {
    width: "min(560px, 100%)",
    maxHeight: "calc(100vh - 24px)",
    overflow: "auto",
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.24)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(236,253,245,0.96) 100%)",
    boxShadow: "0 28px 80px rgba(2,6,23,0.42)",
    padding: 16,
  } as React.CSSProperties,
  quickGrabber: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "rgba(2,6,23,0.20)",
    margin: "0 auto 14px",
  } as React.CSSProperties,
  quickTopLine: { display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between" } as React.CSSProperties,
  quickTitle: { fontSize: 24, fontWeight: 980, letterSpacing: "0", lineHeight: 1.05 } as React.CSSProperties,
  quickSub: { marginTop: 5, fontSize: 13, lineHeight: 1.35, opacity: 0.68, maxWidth: 380 } as React.CSSProperties,
  quickClose: {
    minHeight: 38,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.12)",
    background: "rgba(255,255,255,0.72)",
    fontWeight: 900,
    cursor: "pointer",
  } as React.CSSProperties,
  quickCameraRow: { display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 10, marginTop: 16 } as React.CSSProperties,
  quickCameraBtn: {
    minHeight: 62,
    borderRadius: 18,
    border: "1px solid rgba(14,116,144,0.38)",
    background: "linear-gradient(180deg, #0E7490 0%, #0F3B4A 100%)",
    color: "#fff",
    fontSize: 17,
    fontWeight: 980,
    cursor: "pointer",
    boxShadow: "0 16px 28px rgba(14,116,144,0.24)",
  } as React.CSSProperties,
  quickSecondaryBtn: {
    minHeight: 52,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.13)",
    background: "rgba(255,255,255,0.82)",
    color: "#0B0F14",
    fontWeight: 950,
    cursor: "pointer",
  } as React.CSSProperties,
  quickPhotoRail: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
    marginTop: 14,
  } as React.CSSProperties,
  quickThumbLink: { display: "block", textDecoration: "none" } as React.CSSProperties,
  quickThumb: {
    position: "relative",
    aspectRatio: "1 / 1",
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid rgba(2,6,23,0.12)",
    background: "rgba(2,6,23,0.04)",
  } as React.CSSProperties,
  quickThumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" } as React.CSSProperties,
  quickThumbCount: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    background: "rgba(2,6,23,0.72)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 950,
  } as React.CSSProperties,
  quickEmpty: {
    marginTop: 14,
    minHeight: 72,
    borderRadius: 16,
    border: "1px dashed rgba(2,6,23,0.18)",
    background: "rgba(255,255,255,0.56)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    fontSize: 13,
    opacity: 0.68,
    textAlign: "center",
  } as React.CSSProperties,
  quickNameWrap: { display: "flex", flexDirection: "column", gap: 7, marginTop: 16 } as React.CSSProperties,
  quickLabel: { fontSize: 12, fontWeight: 950, opacity: 0.66, textTransform: "uppercase" } as React.CSSProperties,
  quickNameInput: {
    minHeight: 58,
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid rgba(2,6,23,0.16)",
    background: "rgba(255,255,255,0.94)",
    outline: "none",
    fontSize: 16,
    fontWeight: 850,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94)",
  } as React.CSSProperties,
  quickFooter: { display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 10, marginTop: 16 } as React.CSSProperties,
  quickSaveBtn: {
    minHeight: 56,
    borderRadius: 16,
    border: "1px solid rgba(45,212,191,0.42)",
    background: "linear-gradient(180deg, #2DD4BF 0%, #0E7490 100%)",
    color: "#021014",
    fontWeight: 980,
    cursor: "pointer",
    boxShadow: "0 14px 26px rgba(45,212,191,0.22)",
  } as React.CSSProperties,

  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
    background:
      "linear-gradient(135deg, rgba(7,19,31,0.96) 0%, rgba(10,37,46,0.94) 52%, rgba(15,23,42,0.94) 100%)",
    backdropFilter: "blur(18px)",
    boxShadow: "0 18px 42px rgba(2,6,23,0.22)",
  } as React.CSSProperties,

  topbarCompact: {
    paddingTop: 10,
    paddingBottom: 10,
  } as React.CSSProperties,

  modeTabs: {
    display: "flex",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.09)",
    padding: 4,
    gap: 4,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
  } as React.CSSProperties,
  modeTabsMobile: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    width: "100%",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.09)",
    padding: 4,
    gap: 4,
    order: 3,
  } as React.CSSProperties,
  modeTab: {
    minHeight: 44,
    padding: "10px 14px",
    border: "none",
    borderRadius: 12,
    background: "transparent",
    color: "rgba(255,255,255,0.72)",
    fontWeight: 950,
    cursor: "pointer",
  } as React.CSSProperties,
  modeTabActive: {
    background: "linear-gradient(180deg, #FFFFFF 0%, #DFF9F2 100%)",
    color: "#07131F",
    boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
  } as React.CSSProperties,

  seahubHero: {
    padding: 18,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 16,
    alignItems: "center",
    borderBottom: "1px solid rgba(2,6,23,0.08)",
    background:
      "linear-gradient(135deg, rgba(7,19,31,0.94) 0%, rgba(21,94,117,0.82) 48%, rgba(245,158,11,0.32) 100%)",
    color: "#fff",
  } as React.CSSProperties,
  seahubListTools: { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12 } as React.CSSProperties,
  seahubItemCard: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    gap: 12,
    alignItems: "center",
    borderRadius: 16,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(255,251,235,0.54) 100%)",
    padding: 14,
  } as React.CSSProperties,
  partsHero: {
    padding: 18,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 16,
    alignItems: "center",
    borderBottom: "1px solid rgba(2,6,23,0.08)",
    background:
      "linear-gradient(135deg, rgba(7,19,31,0.94) 0%, rgba(12,74,110,0.84) 55%, rgba(20,184,166,0.32) 100%)",
    color: "#fff",
  } as React.CSSProperties,
  overline: { fontSize: 11, fontWeight: 950, opacity: 0.58, textTransform: "uppercase" } as React.CSSProperties,
  partsHeroTitle: { marginTop: 4, fontWeight: 980, fontSize: 22, letterSpacing: "0" } as React.CSSProperties,
  partsHeroSub: { marginTop: 4, fontSize: 13, opacity: 0.68, lineHeight: 1.35 } as React.CSSProperties,
  partsHeroStats: { display: "grid", gridTemplateColumns: "repeat(3, minmax(110px, 1fr))", gap: 10 } as React.CSSProperties,
  mobileActionBar: { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 12 } as React.CSSProperties,
  linkGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 } as React.CSSProperties,
  linkPill: {
    minHeight: 58,
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.10)",
    background: "rgba(255,255,255,0.78)",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    cursor: "pointer",
  } as React.CSSProperties,
  linkPillActive: {
    borderColor: "rgba(16,185,129,0.42)",
    background: "rgba(209,250,229,0.64)",
  } as React.CSSProperties,
  catalogPartCard: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    gap: 12,
    alignItems: "center",
    borderRadius: 16,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.86) 100%)",
    padding: 14,
  } as React.CSSProperties,
  linkedNames: { marginTop: 6, fontSize: 12, opacity: 0.66, lineHeight: 1.35 } as React.CSSProperties,
  commandStrip: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 14,
  } as React.CSSProperties,
  commandStripMobile: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    marginBottom: 12,
  } as React.CSSProperties,
  commandTile: {
    minHeight: 74,
    border: "1px solid rgba(2,6,23,0.08)",
    borderRadius: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(240,253,250,0.70) 100%)",
    boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "space-between",
    cursor: "pointer",
  } as React.CSSProperties,
  commandKicker: { fontSize: 10, fontWeight: 950, opacity: 0.58, textTransform: "uppercase" } as React.CSSProperties,
  commandValue: { fontSize: 24, fontWeight: 980, letterSpacing: "0", lineHeight: 1 } as React.CSSProperties,
  commandLabel: { fontSize: 11, opacity: 0.64, fontWeight: 850 } as React.CSSProperties,
  bottomDock: {
    position: "fixed",
    left: 10,
    right: 10,
    bottom: "calc(10px + env(safe-area-inset-bottom))",
    zIndex: 60,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1.1fr",
    gap: 8,
    padding: 8,
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.20)",
    background: "rgba(7,19,31,0.92)",
    boxShadow: "0 18px 44px rgba(2,6,23,0.32)",
    backdropFilter: "blur(18px)",
  } as React.CSSProperties,
  dockBtn: {
    minHeight: 54,
    borderRadius: 15,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.07)",
    color: "rgba(255,255,255,0.78)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    fontSize: 11,
    fontWeight: 900,
  } as React.CSSProperties,
  dockBtnActive: { background: "rgba(45,212,191,0.18)", color: "#fff", borderColor: "rgba(45,212,191,0.36)" } as React.CSSProperties,
  dockIcon: { fontSize: 10, opacity: 0.72, fontWeight: 950 } as React.CSSProperties,
  dockAction: {
    minHeight: 54,
    borderRadius: 15,
    border: "1px solid rgba(45,212,191,0.42)",
    background: "linear-gradient(180deg, #2DD4BF 0%, #0E7490 100%)",
    color: "#021014",
    fontWeight: 980,
    boxShadow: "0 12px 24px rgba(45,212,191,0.24)",
  } as React.CSSProperties,
  topbarInner: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    maxWidth: 1320,
    margin: "0 auto",
  } as React.CSSProperties,

  brand: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginRight: 10,
  } as React.CSSProperties,

  titleRow: { display: "flex", alignItems: "baseline", gap: 10 } as React.CSSProperties,
  title: { fontWeight: 950, fontSize: 17, letterSpacing: "0", color: "#fff" } as React.CSSProperties,
  subtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } as React.CSSProperties,
  sep: { opacity: 0.35 } as React.CSSProperties,
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "rgba(45,212,191,0.78)",
    display: "inline-block",
  } as React.CSSProperties,

  shell: { maxWidth: 1320, margin: "0 auto", padding: "14px 12px 96px" } as React.CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16 } as React.CSSProperties,
  gridMobile: { display: "grid", gridTemplateColumns: "1fr", gap: 16 } as React.CSSProperties,

  card: {
    borderRadius: 18,
    border: "1px solid rgba(2, 6, 23, 0.10)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.90) 100%)",
    boxShadow: "0 2px 8px rgba(2,6,23,0.06), 0 20px 50px rgba(15,23,42,0.10)",
    overflow: "hidden",
  } as React.CSSProperties,

  cardPad: { padding: 16, display: "flex", flexDirection: "column", gap: 14 } as React.CSSProperties,

  cardHeader: {
    padding: 15,
    borderBottom: "1px solid rgba(2, 6, 23, 0.07)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(236,253,245,0.30) 100%)",
  } as React.CSSProperties,

  h: { fontWeight: 950, letterSpacing: "-0.02em" } as React.CSSProperties,
  muted: { opacity: 0.65, fontSize: 12 } as React.CSSProperties,
  mutedSmall: { opacity: 0.66, fontSize: 12 } as React.CSSProperties,
  mutedTiny: { opacity: 0.55, fontSize: 11 } as React.CSSProperties,

  searchWrap: { position: "relative", display: "flex", alignItems: "center" } as React.CSSProperties,
  iconBtn: {
    position: "absolute",
    right: 8,
    border: "1px solid rgba(2,6,23,0.10)",
    background: "rgba(255,255,255,0.85)",
    borderRadius: 10,
    height: 28,
    width: 28,
    cursor: "pointer",
    opacity: 0.7,
  } as React.CSSProperties,

  searchWrapMobile: { position: "relative", width: "100%" } as React.CSSProperties,
  iconBtnMobile: {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    border: "1px solid rgba(2,6,23,0.10)",
    background: "rgba(255,255,255,0.85)",
    borderRadius: 10,
    height: 28,
    width: 28,
    cursor: "pointer",
    opacity: 0.7,
  } as React.CSSProperties,

  field: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.14)",
    background: "rgba(255,255,255,0.92)",
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92)",
  } as React.CSSProperties,

  btnPrimary: {
    minHeight: 44,
    padding: "10px 14px",
    borderRadius: 13,
    border: "1px solid rgba(14,116,144,0.40)",
    background: "linear-gradient(180deg, #0E7490 0%, #0F3B4A 100%)",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(14,116,144,0.22)",
  } as React.CSSProperties,

  btnGhost: {
    minHeight: 44,
    padding: "10px 14px",
    borderRadius: 13,
    border: "1px solid rgba(15,23,42,0.13)",
    background: "rgba(255,255,255,0.78)",
    color: "#0B0F14",
    fontWeight: 900,
    cursor: "pointer",
  } as React.CSSProperties,

  btnDanger: {
    minHeight: 44,
    padding: "10px 14px",
    borderRadius: 13,
    border: "1px solid rgba(225,29,72,0.24)",
    background: "rgba(255,255,255,0.82)",
    color: "#BE123C",
    fontWeight: 950,
    cursor: "pointer",
  } as React.CSSProperties,

  toggle: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 13,
    opacity: 0.9,
    userSelect: "none",
  } as React.CSSProperties,

  segment: {
    display: "flex",
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.14)",
    background: "rgba(255,255,255,0.60)",
    overflow: "hidden",
  } as React.CSSProperties,
  segmentBtn: {
    padding: "10px 12px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
    color: "rgba(2,6,23,0.70)",
  } as React.CSSProperties,
  segmentBtnActive: {
    background: "linear-gradient(180deg, rgba(11,15,20,0.92) 0%, rgba(17,24,39,0.92) 100%)",
    color: "#fff",
  } as React.CSSProperties,

  toggleLarge: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(2,6,23,0.10)",
    background: "rgba(2,6,23,0.02)",
  } as React.CSSProperties,

  pill: {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(2,6,23,0.14)",
    fontWeight: 950,
    letterSpacing: "0.04em",
    lineHeight: 1.1,
  } as React.CSSProperties,
  pillNeutral: { background: "rgba(255,255,255,0.70)", color: "rgba(2,6,23,0.80)" } as React.CSSProperties,
  pillMuted: { background: "rgba(2,6,23,0.04)", color: "rgba(2,6,23,0.62)" } as React.CSSProperties,
  pillDanger: {
    background: "rgba(239,68,68,0.07)",
    borderColor: "rgba(239,68,68,0.22)",
    color: "#B91C1C",
  } as React.CSSProperties,
  pillSuccess: {
    background: "rgba(16,185,129,0.08)",
    borderColor: "rgba(16,185,129,0.24)",
    color: "#047857",
  } as React.CSSProperties,
  pillBrand: {
    background: "rgba(17,24,39,0.06)",
    borderColor: "rgba(17,24,39,0.18)",
    color: "#111827",
  } as React.CSSProperties,

  chip: {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid rgba(2,6,23,0.10)",
    background: "rgba(255,255,255,0.80)",
    color: "rgba(2,6,23,0.72)",
    fontWeight: 750,
  } as React.CSSProperties,
  moreTag: { fontSize: 11, opacity: 0.6, fontWeight: 800, padding: "3px 4px" } as React.CSSProperties,

  list: { position: "relative" } as React.CSSProperties,
  tableHead: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 100%)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(2,6,23,0.06)",
    padding: "10px 12px",
  } as React.CSSProperties,
  tableHeadGrid: {
    display: "grid",
    gridTemplateColumns: "1.35fr 0.9fr 0.75fr",
    gap: 12,
    alignItems: "center",
  } as React.CSSProperties,
  tableHeadLabel: {
    fontSize: 11,
    opacity: 0.6,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  } as React.CSSProperties,

  rowsWrap: { maxHeight: "72vh", overflow: "auto" } as React.CSSProperties,

  row: {
    position: "relative",
    padding: "12px 12px 12px 14px",
    borderBottom: "1px solid rgba(2,6,23,0.06)",
    cursor: "pointer",
  } as React.CSSProperties,
  rowActive: {
    background: "linear-gradient(90deg, rgba(2,6,23,0.07) 0%, rgba(2,6,23,0.03) 45%, transparent 78%)",
  } as React.CSSProperties,
  rowAccent: (active: boolean) =>
    ({
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      background: active ? "rgba(17,24,39,0.85)" : "transparent",
      borderRadius: 999,
    } as React.CSSProperties),
  rowGrid: {
    display: "grid",
    gridTemplateColumns: "1.35fr 0.9fr 0.75fr",
    gap: 12,
    alignItems: "center",
  } as React.CSSProperties,
  rowNameLine: { display: "flex", gap: 8, alignItems: "center", minWidth: 0, flexWrap: "wrap" } as React.CSSProperties,
  rowName: {
    fontWeight: 950,
    letterSpacing: "-0.01em",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  rowSub: { marginTop: 6 } as React.CSSProperties,
  colTitle: { fontWeight: 850, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties,

  emptyList: { padding: 18, display: "flex", flexDirection: "column", gap: 8 } as React.CSSProperties,
  emptyTitle: { fontWeight: 950, letterSpacing: "-0.01em" } as React.CSSProperties,
  emptySub: { opacity: 0.7, fontSize: 13, lineHeight: 1.35 } as React.CSSProperties,

  editorTop: {
    padding: 16,
    borderBottom: "1px solid rgba(2,6,23,0.06)",
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    background:
      "radial-gradient(900px 240px at 10% 0%, rgba(2,6,23,0.06), transparent 55%)," +
      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.78) 100%)",
    backdropFilter: "blur(10px)",
    flexWrap: "wrap",
  } as React.CSSProperties,
  editorTitleLine: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } as React.CSSProperties,
  editorTitle: { fontWeight: 980, fontSize: 16, letterSpacing: "-0.02em", minWidth: 0 } as React.CSSProperties,
  editorMeta: { fontSize: 12, opacity: 0.65, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } as React.CSSProperties,
  metaKey: { fontWeight: 900, opacity: 0.8 } as React.CSSProperties,
  metaVal: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 11,
    opacity: 0.85,
  } as React.CSSProperties,

  section: {
    borderRadius: 16,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "rgba(255,255,255,0.78)",
    overflow: "hidden",
    boxShadow: "0 10px 26px rgba(15,23,42,0.045)",
  } as React.CSSProperties,
  sectionHeader: {
    padding: "13px 12px",
    borderBottom: "1px solid rgba(2,6,23,0.07)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "linear-gradient(90deg, rgba(20,184,166,0.10) 0%, rgba(255,255,255,0.24) 100%)",
  } as React.CSSProperties,
  sectionTitle: { fontWeight: 950, letterSpacing: "-0.01em" } as React.CSSProperties,
  sectionBody: { padding: 12 } as React.CSSProperties,

  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as React.CSSProperties,
  formGridMobile: { display: "grid", gridTemplateColumns: "1fr", gap: 12 } as React.CSSProperties,

  fieldWrap: { display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties,
  labelRow: { display: "flex", alignItems: "baseline", gap: 8 } as React.CSSProperties,
  label: { fontSize: 12, fontWeight: 900, opacity: 0.72 } as React.CSSProperties,
  hint: { fontSize: 11, opacity: 0.55, marginLeft: "auto" } as React.CSSProperties,

  seahubRow: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" } as React.CSSProperties,

  photoLayout: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as React.CSSProperties,
  photoLayoutMobile: { display: "grid", gridTemplateColumns: "1fr", gap: 12 } as React.CSSProperties,

  coverCard: {
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(2,6,23,0.10)",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F6F7F9 100%)",
    aspectRatio: "16 / 10",
  } as React.CSSProperties,
  coverOverlay: {
    position: "absolute",
    left: 12,
    bottom: 12,
    right: 12,
    padding: 10,
    borderRadius: 14,
    background: "rgba(11,15,20,0.55)",
    color: "#fff",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
  } as React.CSSProperties,
  coverTitle: { fontWeight: 950, letterSpacing: "-0.01em" } as React.CSSProperties,
  coverSub: { fontSize: 12, opacity: 0.85 } as React.CSSProperties,

  photoGridMobile: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 } as React.CSSProperties,
  photoCard: {
    borderRadius: 16,
    overflow: "hidden",
    border: "1px solid rgba(2,6,23,0.10)",
    background: "linear-gradient(180deg, #FFFFFF 0%, #F6F7F9 100%)",
    aspectRatio: "1 / 1",
  } as React.CSSProperties,
  photoLoading: { padding: 12, opacity: 0.7, fontSize: 12 } as React.CSSProperties,

  photoEmpty: {
    padding: 16,
    borderRadius: 16,
    border: "1px dashed rgba(2,6,23,0.16)",
    background: "rgba(2,6,23,0.02)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } as React.CSSProperties,

  partsSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  } as React.CSSProperties,

  metricTile: {
    borderRadius: 14,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(246,247,249,0.78) 100%)",
    padding: 12,
    minWidth: 0,
  } as React.CSSProperties,
  metricValue: { fontWeight: 950, fontSize: 18, letterSpacing: "-0.01em" } as React.CSSProperties,
  metricLabel: { marginTop: 2, fontSize: 11, opacity: 0.62, fontWeight: 850 } as React.CSSProperties,

  partFormPanel: {
    borderRadius: 16,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "rgba(255,255,255,0.62)",
    padding: 12,
  } as React.CSSProperties,

  partCatalog: {
    borderRadius: 16,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "rgba(2,6,23,0.025)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } as React.CSSProperties,
  partRows: { display: "flex", flexDirection: "column", gap: 10 } as React.CSSProperties,
  partRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto auto",
    gap: 12,
    alignItems: "center",
    borderRadius: 14,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "rgba(255,255,255,0.76)",
    padding: 12,
  } as React.CSSProperties,
  partNameLine: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } as React.CSSProperties,
  partName: { fontWeight: 950, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" } as React.CSSProperties,
  partQtyBlock: { minWidth: 82, textAlign: "right" } as React.CSSProperties,
  partQty: { fontWeight: 950, fontSize: 18 } as React.CSSProperties,
  partActions: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" } as React.CSSProperties,
  mobileFilters: { width: "100%", display: "flex", flexDirection: "column", gap: 10 } as React.CSSProperties,
  mobileRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } as React.CSSProperties,
};

const css = `
  .field:focus {
    border-color: rgba(17,24,39,0.30);
    box-shadow: 0 0 0 4px rgba(17,24,39,0.08), inset 0 1px 0 rgba(255,255,255,0.92);
  }
  .btn:hover { transform: translateY(-1px); filter: brightness(1.02); }
  .btn:active { transform: translateY(0px); filter: brightness(0.98); }
  .rowHover:hover {
    background: linear-gradient(90deg, rgba(2,6,23,0.035) 0%, rgba(2,6,23,0.015) 38%, transparent 75%);
  }
  .photoHover:hover {
    box-shadow: 0 14px 34px rgba(2,6,23,0.10);
    transform: translateY(-1px);
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  @media (max-width: 980px) {
    .btn { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
    input, select, textarea { font-size: 16px !important; }
  }
`;