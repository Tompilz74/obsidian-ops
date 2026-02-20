import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

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

const statuses = ["active", "spare", "out"] as const;

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

    // revoke old preview urls
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
    setSelectedId(null);
    setPhotos([]);
    setPhotoUrls({});
    if (isMobile) setMobileTab("editor");
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
    loadPhotos(r.id).catch(console.error);
    if (isMobile) setMobileTab("editor");
  }

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

    // clear pending (and revoke previews)
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

        // editing existing: if any pending got added somehow, finalize too
        await finalizePendingPhotos(form.id);
        await loadPhotos(form.id);

        await loadComponents();
        showToast("success", "Component updated.");
      } else {
        const res = await supabase.from("components").insert(payload).select("id").single();
        if (res.error) throw res.error;

        const newId = res.data.id as string;

        // ✅ finalize draft photos into this new component
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

  async function deleteComponent(id: string) {
    if (!confirm("Delete this component?")) return;
    setLoading(true);
    try {
      const res = await supabase.from("components").delete().eq("id", id);
      if (res.error) throw res.error;
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

  // ✅ NEW: upload works even without a component id
  async function uploadPhoto(file: File) {
    const componentId = selectedId ?? form.id;

    // If component exists -> normal flow
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

    // No component yet -> draft upload
    const draftId = draftIdRef.current;
    const tempPath = makeDraftPath(draftId, file.name);
    const previewUrl = URL.createObjectURL(file);

    setLoading(true);
    try {
      const up = await supabase.storage.from("component-photos").upload(tempPath, file, { upsert: false });
      if (up.error) throw up.error;

      setPendingPhotos((p) => [...p, { tempPath, fileName: file.name, previewUrl }]);
      showToast("success", "Photo added. Hit Create to save it with the component.");
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
  // - If component exists and has saved photos -> use signed url
  // - Else if draft has photos -> use local preview
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

          {isMobile ? (
            isMobileEditor ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
                <button onClick={() => setMobileTab("list")} className="btn" style={ui.btnGhost}>
                  ← List
                </button>
                <button onClick={startAdd} className="btn" style={ui.btnPrimary}>
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

                <button onClick={startAdd} className="btn" style={ui.btnPrimary}>
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

              <button onClick={startAdd} className="btn" style={{ ...ui.btnPrimary, marginLeft: "auto" }}>
                + Add
              </button>
              <button onClick={signOut} className="btn" style={ui.btnGhost}>
                Sign out
              </button>
            </>
          )}

          {isMobile && mobileTab === "list" ? (
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
        <div style={isMobile ? ui.gridMobile : ui.grid}>
          {/* List */}
          {showList ? (
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
          {showEditor ? (
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
                {/* (identity / placement / tags / seahub sections unchanged in your snippet) */}
                {/* Keep your existing sections above this Photos section exactly as you had them */}

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
                            <div style={ui.coverSub}>
                              {(photos.length || 0) + (pendingPhotos.length || 0)} photos
                            </div>
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

                        {/* draft photos (skip draft cover) */}
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
    </div>
  );
}

/** --------------------- Styles --------------------- */

const ui = {
  page: {
    fontFamily: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`,
    color: "#0B0F14",
    background:
      "radial-gradient(1200px 600px at 10% -10%, rgba(2,6,23,0.10), transparent 60%)," +
      "radial-gradient(900px 500px at 90% 10%, rgba(2,6,23,0.07), transparent 55%)," +
      "linear-gradient(180deg, #F7F8FA 0%, #F2F4F7 100%)",
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

  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    padding: 16,
    borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.72) 100%)",
    backdropFilter: "blur(12px)",
  } as React.CSSProperties,

  topbarCompact: {
    paddingTop: 10,
    paddingBottom: 10,
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
  title: { fontWeight: 950, fontSize: 16, letterSpacing: "-0.02em" } as React.CSSProperties,
  subtitle: {
    fontSize: 12,
    opacity: 0.66,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } as React.CSSProperties,
  sep: { opacity: 0.35 } as React.CSSProperties,
  dot: { width: 8, height: 8, borderRadius: 999, background: "rgba(2,6,23,0.25)", display: "inline-block" } as React.CSSProperties,

  shell: { maxWidth: 1320, margin: "0 auto", padding: 16 } as React.CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16 } as React.CSSProperties,
  gridMobile: { display: "grid", gridTemplateColumns: "1fr", gap: 16 } as React.CSSProperties,

  card: {
    borderRadius: 18,
    border: "1px solid rgba(2, 6, 23, 0.10)",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FBFCFD 100%)",
    boxShadow: "0 1px 2px rgba(2,6,23,0.05), 0 14px 34px rgba(2,6,23,0.07)",
    overflow: "hidden",
  } as React.CSSProperties,

  cardPad: { padding: 16, display: "flex", flexDirection: "column", gap: 14 } as React.CSSProperties,

  cardHeader: {
    padding: 14,
    borderBottom: "1px solid rgba(2, 6, 23, 0.06)",
    display: "flex",
    alignItems: "center",
    gap: 10,
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
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.65)",
    background: "linear-gradient(180deg, #0B0F14 0%, #111827 100%)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 22px rgba(2,6,23,0.18)",
  } as React.CSSProperties,

  btnGhost: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.14)",
    background: "rgba(255,255,255,0.70)",
    color: "#0B0F14",
    fontWeight: 850,
    cursor: "pointer",
  } as React.CSSProperties,

  btnDanger: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.30)",
    background: "rgba(255,255,255,0.75)",
    color: "#B91C1C",
    fontWeight: 900,
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
  pillDanger: { background: "rgba(239,68,68,0.07)", borderColor: "rgba(239,68,68,0.22)", color: "#B91C1C" } as React.CSSProperties,
  pillSuccess: { background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.24)", color: "#047857" } as React.CSSProperties,
  pillBrand: { background: "rgba(17,24,39,0.06)", borderColor: "rgba(17,24,39,0.18)", color: "#111827" } as React.CSSProperties,

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
  metaVal: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 11, opacity: 0.85 } as React.CSSProperties,

  section: {
    borderRadius: 16,
    border: "1px solid rgba(2,6,23,0.08)",
    background: "rgba(255,255,255,0.70)",
    overflow: "hidden",
  } as React.CSSProperties,
  sectionHeader: {
    padding: "12px 12px",
    borderBottom: "1px solid rgba(2,6,23,0.06)",
    display: "flex",
    alignItems: "center",
    gap: 10,
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
`;