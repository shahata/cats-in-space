import type { FC, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Dropdown,
  EmptyState,
  FormField,
  Image,
  ImageViewer,
  Input,
  InputArea,
  Loader,
  MultiSelectCheckbox,
  NumberInput,
  Page,
  SidePanel,
  Table,
  TableActionCell,
  Tabs,
  Text,
  WixDesignSystemProvider,
} from "@wix/design-system";
import "@wix/design-system/styles.global.css";
import { Add, Delete, Edit, Refresh } from "@wix/wix-ui-icons-common";
import { items } from "@wix/data";
import { dashboard } from "@wix/dashboard";
import { media } from "@wix/sdk";
import type { files } from "@wix/media";

type CollectionId = "CatExplorers" | "Missions" | "Planets";

type DataRow = {
  _id?: string;
  _createdDate?: Date | string;
  _updatedDate?: Date | string;
  [field: string]: unknown;
};

type ColumnConfig = {
  title: string;
  render: (row: DataRow) => ReactNode;
  width: string;
  align?: "start" | "center" | "end";
};

type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "image"
  | "reference"
  | "multiReference";

type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  referencedCollectionId?: CollectionId;
};

type CollectionConfig = {
  id: CollectionId;
  label: string;
  itemNoun: string;
  emptySubtitle: string;
  columns: ColumnConfig[];
  fields: FieldConfig[];
};

type FormValue = string | number | string[];
type FormState = Record<string, FormValue>;

type ReferenceOption = { _id: string; label: string };
type ReferenceOptionCache = Record<string, ReferenceOption[]>;
type ReferenceLoading = Record<string, boolean>;

const DISPLAY_FIELD_BY_COLLECTION: Record<CollectionId, string> = {
  CatExplorers: "name",
  Missions: "title",
  Planets: "title",
};

const formatDate = (value: unknown): string => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const renderText = (value: unknown): ReactNode => {
  if (value === null || value === undefined || value === "") {
    return (
      <Text size="small" secondary>
        —
      </Text>
    );
  }
  return <Text size="small">{String(value)}</Text>;
};

const renderImage = (value: unknown): ReactNode => {
  if (typeof value !== "string" || value === "") {
    return (
      <Text size="small" secondary>
        —
      </Text>
    );
  }
  let url: string | undefined;
  if (value.startsWith("wix:image://")) {
    try {
      url = media.getScaledToFillImageUrl(value, 80, 80, {});
    } catch {
      url = undefined;
    }
  } else if (value.startsWith("http")) {
    url = value;
  }
  if (!url) {
    return (
      <Text size="small" secondary>
        —
      </Text>
    );
  }
  return (
    <Image src={url} width={40} height={40} fit="cover" borderRadius={4} alt="" />
  );
};

const renderStatus = (value: unknown): ReactNode => {
  if (!value) {
    return (
      <Text size="small" secondary>
        —
      </Text>
    );
  }
  const status = String(value);
  const skin: "success" | "warning" | "danger" | "neutralLight" | "standard" =
    /active|top|on mission|inhabited|explored/i.test(status)
      ? "success"
      : /candidate|exploring|pending|launching/i.test(status)
        ? "standard"
        : /reject|fail|hostile/i.test(status)
          ? "danger"
          : "neutralLight";
  return (
    <Badge size="small" skin={skin}>
      {status}
    </Badge>
  );
};

const COLLECTIONS: CollectionConfig[] = [
  {
    id: "CatExplorers",
    label: "Cat Explorers",
    itemNoun: "explorer",
    emptySubtitle: "No cat explorers yet. Recruit your first feline astronaut.",
    columns: [
      { title: "", render: (r) => renderImage(r.image), width: "60px" },
      { title: "Name", render: (r) => renderText(r.name), width: "22%" },
      { title: "Role", render: (r) => renderText(r.role), width: "22%" },
      { title: "Status", render: (r) => renderStatus(r.status), width: "18%" },
      {
        title: "Updated",
        render: (r) => renderText(formatDate(r._updatedDate)),
        width: "18%",
      },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "slug", label: "Slug", type: "text", required: true },
      { key: "role", label: "Role", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "specialSkill", label: "Special skill", type: "text" },
      { key: "funFact", label: "Fun fact", type: "textarea" },
      { key: "bio", label: "Bio", type: "textarea" },
      { key: "image", label: "Image", type: "image" },
      {
        key: "crew",
        label: "Missions",
        type: "multiReference",
        referencedCollectionId: "Missions",
      },
    ],
  },
  {
    id: "Missions",
    label: "Missions",
    itemNoun: "mission",
    emptySubtitle: "No missions yet. Plan your first interstellar voyage.",
    columns: [
      { title: "Title", render: (r) => renderText(r.title), width: "24%" },
      { title: "Planet", render: (r) => renderText(r.planet), width: "16%" },
      {
        title: "Launch",
        render: (r) => renderText(r.launchDate),
        width: "14%",
      },
      { title: "Status", render: (r) => renderStatus(r.status), width: "14%" },
      {
        title: "Updated",
        render: (r) => renderText(formatDate(r._updatedDate)),
        width: "14%",
      },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "slug", label: "Slug", type: "text", required: true },
      { key: "planet", label: "Planet", type: "text" },
      { key: "launchDate", label: "Launch date", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "missionLog", label: "Mission log", type: "textarea" },
      {
        key: "planetRef",
        label: "Planet (linked)",
        type: "reference",
        referencedCollectionId: "Planets",
      },
      {
        key: "crew",
        label: "Crew",
        type: "multiReference",
        referencedCollectionId: "CatExplorers",
      },
    ],
  },
  {
    id: "Planets",
    label: "Planets",
    itemNoun: "planet",
    emptySubtitle:
      "No planets yet. Chart a new world for your cats to explore.",
    columns: [
      { title: "", render: (r) => renderImage(r.image), width: "60px" },
      { title: "Title", render: (r) => renderText(r.title), width: "18%" },
      {
        title: "Atmosphere",
        render: (r) => renderText(r.atmosphere),
        width: "16%",
      },
      {
        title: "Distance",
        render: (r) => renderText(r.distance),
        width: "14%",
      },
      {
        title: "Habitability",
        render: (r) => renderText(r.habitabilityScore),
        width: "12%",
      },
      { title: "Status", render: (r) => renderStatus(r.status), width: "12%" },
      {
        title: "Updated",
        render: (r) => renderText(formatDate(r._updatedDate)),
        width: "14%",
      },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "slug", label: "Slug", type: "text", required: true },
      { key: "atmosphere", label: "Atmosphere", type: "text" },
      { key: "gravity", label: "Gravity", type: "text" },
      { key: "distance", label: "Distance", type: "text" },
      { key: "status", label: "Status", type: "text" },
      {
        key: "habitabilityScore",
        label: "Habitability score",
        type: "number",
      },
      { key: "tagline", label: "Tagline", type: "textarea" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "image", label: "Image", type: "image" },
    ],
  },
];

const getCollection = (id: CollectionId): CollectionConfig => {
  const found = COLLECTIONS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown collection: ${id}`);
  return found;
};

const capitalize = (s: string): string =>
  s.length === 0 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

const buildInitialFormState = (
  collection: CollectionConfig,
  row?: DataRow,
): FormState => {
  const state: FormState = {};
  for (const field of collection.fields) {
    const raw = row?.[field.key];
    if (field.type === "number") {
      state[field.key] =
        typeof raw === "number"
          ? raw
          : raw === null || raw === undefined || raw === ""
            ? ""
            : Number.isNaN(Number(raw))
              ? ""
              : Number(raw);
    } else if (field.type === "multiReference") {
      // multiReference IDs are loaded asynchronously after the panel opens
      // (queryReferenced); start empty and merge in once available.
      state[field.key] = [];
    } else if (field.type === "reference") {
      // Single-reference fields can be stored as either a plain ID string or
      // an object containing `_id` (when expanded). Normalize to a string ID.
      if (typeof raw === "string") {
        state[field.key] = raw;
      } else if (
        raw &&
        typeof raw === "object" &&
        "_id" in raw &&
        typeof (raw as { _id?: unknown })._id === "string"
      ) {
        state[field.key] = (raw as { _id: string })._id;
      } else {
        state[field.key] = "";
      }
    } else {
      state[field.key] =
        raw === null || raw === undefined ? "" : String(raw);
    }
  }
  return state;
};

const stripEmptyFields = (
  collection: CollectionConfig,
  values: FormState,
): Record<string, FormValue> => {
  const cleaned: Record<string, FormValue> = {};
  for (const field of collection.fields) {
    if (field.type === "multiReference") {
      // Handled separately via items.replaceReferences after insert/update.
      continue;
    }
    const value = values[field.key];
    if (field.type === "number") {
      if (typeof value === "number" && !Number.isNaN(value)) {
        cleaned[field.key] = value;
      } else if (typeof value === "string" && value !== "") {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed)) cleaned[field.key] = parsed;
      }
    } else {
      const str = typeof value === "string" ? value.trim() : "";
      if (str !== "") cleaned[field.key] = str;
    }
  }
  return cleaned;
};

const areRequiredFilled = (
  collection: CollectionConfig,
  values: FormState,
): boolean =>
  collection.fields
    .filter((f) => f.required)
    .every((f) => {
      const v = values[f.key];
      if (Array.isArray(v)) return v.length > 0;
      return typeof v === "string" ? v.trim() !== "" : v !== undefined;
    });

type EditorMode = "add" | "edit";

type EditorState = {
  mode: EditorMode;
  collectionId: CollectionId;
  rowId?: string;
  values: FormState;
};

const DashboardPage: FC = () => {
  const [activeId, setActiveId] = useState<CollectionId>("CatExplorers");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [refOptions, setRefOptions] = useState<ReferenceOptionCache>({});
  const [refLoading, setRefLoading] = useState<ReferenceLoading>({});

  const activeCollection = useMemo(() => getCollection(activeId), [activeId]);

  const loadRows = useCallback(
    async (collectionId: CollectionId): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const result = await items
          .query(collectionId)
          .descending("_updatedDate")
          .limit(100)
          .find();
        setRows(result.items as DataRow[]);
      } catch (err) {
        console.error(`Failed to load ${collectionId}`, err);
        setError(err instanceof Error ? err.message : "Failed to load items");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadRows(activeId);
  }, [activeId, loadRows]);

  const ensureReferenceOptionsLoaded = useCallback(
    async (collectionId: CollectionId): Promise<void> => {
      // Read latest cache state at call time to avoid stale-closure misses.
      let alreadyHas = false;
      let alreadyLoading = false;
      setRefOptions((current) => {
        alreadyHas = current[collectionId] !== undefined;
        return current;
      });
      setRefLoading((current) => {
        alreadyLoading = current[collectionId] === true;
        return current;
      });
      if (alreadyHas || alreadyLoading) return;

      setRefLoading((prev) => ({ ...prev, [collectionId]: true }));
      try {
        const result = await items.query(collectionId).limit(200).find();
        const displayField = DISPLAY_FIELD_BY_COLLECTION[collectionId];
        const opts: ReferenceOption[] = result.items
          .filter((it): it is { _id: string } & Record<string, unknown> =>
            typeof (it as { _id?: unknown })._id === "string",
          )
          .map((it) => {
            const raw = it[displayField];
            const label =
              typeof raw === "string" && raw.trim() !== "" ? raw : it._id;
            return { _id: it._id, label };
          });
        setRefOptions((prev) => ({ ...prev, [collectionId]: opts }));
      } catch (err) {
        console.error(`Failed to load ${collectionId} options`, err);
        setRefOptions((prev) => ({ ...prev, [collectionId]: [] }));
        dashboard.showToast({
          message: `Failed to load ${collectionId} options.`,
          type: "error",
        });
      } finally {
        setRefLoading((prev) => ({ ...prev, [collectionId]: false }));
      }
    },
    [],
  );

  const loadEditorReferences = useCallback(
    (collection: CollectionConfig): void => {
      for (const field of collection.fields) {
        if (
          (field.type === "reference" || field.type === "multiReference") &&
          field.referencedCollectionId
        ) {
          void ensureReferenceOptionsLoaded(field.referencedCollectionId);
        }
      }
    },
    [ensureReferenceOptionsLoaded],
  );

  const loadExistingMultiReferences = useCallback(
    async (
      collection: CollectionConfig,
      rowId: string,
    ): Promise<Record<string, string[]>> => {
      const result: Record<string, string[]> = {};
      const multiRefFields = collection.fields.filter(
        (f) => f.type === "multiReference" && f.referencedCollectionId,
      );
      await Promise.all(
        multiRefFields.map(async (field) => {
          try {
            const queryResult = await items.queryReferenced(
              collection.id,
              rowId,
              field.key,
            );
            const ids: string[] = [];
            for (const item of queryResult.items) {
              const itemId = (item as { _id?: unknown })._id;
              if (typeof itemId === "string") ids.push(itemId);
            }
            result[field.key] = ids;
          } catch (err) {
            console.error(
              `Failed to load existing references for ${field.key}`,
              err,
            );
            result[field.key] = [];
          }
        }),
      );
      return result;
    },
    [],
  );

  const openAddEditor = useCallback((): void => {
    const collection = getCollection(activeId);
    setEditor({
      mode: "add",
      collectionId: activeId,
      values: buildInitialFormState(collection),
    });
    loadEditorReferences(collection);
  }, [activeId, loadEditorReferences]);

  const openEditEditor = useCallback(
    (row: DataRow): void => {
      if (!row._id) return;
      const collection = getCollection(activeId);
      const initial = buildInitialFormState(collection, row);
      setEditor({
        mode: "edit",
        collectionId: activeId,
        rowId: row._id,
        values: initial,
      });
      loadEditorReferences(collection);

      const rowId = row._id;
      void (async () => {
        const existing = await loadExistingMultiReferences(collection, rowId);
        setEditor((prev) => {
          if (!prev || prev.rowId !== rowId) return prev;
          return {
            ...prev,
            values: { ...prev.values, ...existing },
          };
        });
      })();
    },
    [activeId, loadEditorReferences, loadExistingMultiReferences],
  );

  const closeEditor = useCallback((): void => {
    if (saving) return;
    setEditor(null);
  }, [saving]);

  const handleFieldChange = useCallback(
    (key: string, value: FormValue): void => {
      setEditor((prev) =>
        prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev,
      );
    },
    [],
  );

  const pickImage = useCallback(async (key: string): Promise<void> => {
    try {
      const response = await dashboard.openMediaManager({ category: "IMAGE" });
      if (!response) return;
      const picked: files.FileDescriptor | undefined = response.items[0];
      if (!picked) return;
      // The Media Manager returns a FileDescriptor whose `url` is the
      // wix:image://... URI suitable for storing in CMS image fields and
      // resolving via @wix/sdk media helpers.
      const url = picked.url;
      if (typeof url === "string" && url !== "") {
        handleFieldChange(key, url);
      }
    } catch (err) {
      console.error("Failed to open media manager", err);
      dashboard.showToast({
        message: "Couldn't open the Media Manager.",
        type: "error",
      });
    }
  }, [handleFieldChange]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!editor) return;
    const collection = getCollection(editor.collectionId);
    if (!areRequiredFilled(collection, editor.values)) return;

    setSaving(true);
    try {
      const cleaned = stripEmptyFields(collection, editor.values);
      const multiRefFields = collection.fields.filter(
        (f) => f.type === "multiReference" && f.referencedCollectionId,
      );

      let savedId: string;
      if (editor.mode === "add") {
        const inserted = await items.insert(editor.collectionId, cleaned);
        const insertedId = (inserted as { _id?: unknown })._id;
        if (typeof insertedId !== "string") {
          throw new Error("Insert did not return an _id");
        }
        savedId = insertedId;
      } else {
        if (!editor.rowId) throw new Error("Missing row id for edit");
        await items.update(editor.collectionId, {
          _id: editor.rowId,
          ...cleaned,
        });
        savedId = editor.rowId;
      }

      // Sync multi-reference fields. For "add", only call when the user picked
      // anything; for "edit", always call so removed items get cleared.
      try {
        await Promise.all(
          multiRefFields.map((field) => {
            const value = editor.values[field.key];
            const ids = Array.isArray(value) ? value : [];
            if (editor.mode === "add" && ids.length === 0) {
              return Promise.resolve();
            }
            return items.replaceReferences(
              editor.collectionId,
              field.key,
              savedId,
              ids,
            );
          }),
        );
      } catch (refErr) {
        console.error("Failed to sync references", refErr);
        dashboard.showToast({
          message: `${capitalize(collection.itemNoun)} saved, but linked references could not be updated.`,
          type: "error",
        });
        setEditor(null);
        await loadRows(editor.collectionId);
        return;
      }

      dashboard.showToast({
        message: `${capitalize(collection.itemNoun)} ${editor.mode === "add" ? "created" : "updated"}.`,
        type: "success",
      });
      setEditor(null);
      await loadRows(editor.collectionId);
    } catch (err) {
      console.error("Failed to save item", err);
      dashboard.showToast({
        message: `Failed to ${editor.mode === "add" ? "create" : "update"} ${collection.itemNoun}.`,
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [editor, loadRows]);

  const handleDelete = useCallback(
    async (item: DataRow): Promise<void> => {
      const id = item._id;
      if (!id) return;
      const collection = getCollection(activeId);
      const label =
        (item.name as string | undefined) ||
        (item.title as string | undefined) ||
        `this ${collection.itemNoun}`;
      const confirmed = window.confirm(
        `Delete "${label}"? This cannot be undone.`,
      );
      if (!confirmed) return;

      try {
        await items.remove(activeId, id);
        dashboard.showToast({
          message: `${capitalize(collection.itemNoun)} deleted.`,
          type: "success",
        });
        await loadRows(activeId);
      } catch (err) {
        console.error("Failed to delete item", err);
        dashboard.showToast({
          message: `Failed to delete ${collection.itemNoun}.`,
          type: "error",
        });
      }
    },
    [activeId, loadRows],
  );

  const tableColumns = useMemo(() => {
    type Col = {
      title: string;
      render: (row: DataRow) => ReactNode;
      width: string;
      align?: "start" | "center" | "end";
    };
    const cols: Col[] = activeCollection.columns.map((col) => ({
      title: col.title,
      render: col.render,
      width: col.width,
      ...(col.align ? { align: col.align } : {}),
    }));
    cols.push({
      title: "",
      width: "120px",
      align: "end",
      render: (row: DataRow) => (
        <TableActionCell
          secondaryActions={[
            {
              text: "Edit",
              icon: <Edit />,
              onClick: () => openEditEditor(row),
            },
            {
              text: "Delete",
              icon: <Delete />,
              skin: "destructive",
              onClick: () => {
                void handleDelete(row);
              },
            },
          ]}
          numOfVisibleSecondaryActions={2}
        />
      ),
    });
    return cols;
  }, [activeCollection, handleDelete, openEditEditor]);

  const renderBody = (): ReactNode => {
    if (loading) {
      return (
        <Card>
          <Box align="center" verticalAlign="middle" padding="SP6">
            <Loader
              size="medium"
              text={`Loading ${activeCollection.label.toLowerCase()}…`}
            />
          </Box>
        </Card>
      );
    }

    if (error) {
      return (
        <Card>
          <EmptyState
            skin="section"
            title="Couldn't load data"
            subtitle={error}
          >
            <Button
              size="small"
              priority="secondary"
              prefixIcon={<Refresh />}
              onClick={() => {
                void loadRows(activeId);
              }}
            >
              Try again
            </Button>
          </EmptyState>
        </Card>
      );
    }

    if (rows.length === 0) {
      return (
        <Card>
          <EmptyState
            skin="section"
            title={`No ${activeCollection.label.toLowerCase()} yet`}
            subtitle={activeCollection.emptySubtitle}
          >
            <Button size="small" prefixIcon={<Add />} onClick={openAddEditor}>
              Add {activeCollection.itemNoun}
            </Button>
          </EmptyState>
        </Card>
      );
    }

    return (
      <Card>
        <Table data={rows} columns={tableColumns} rowVerticalPadding="medium">
          <Table.Content />
        </Table>
      </Card>
    );
  };

  const renderImageField = (
    field: FieldConfig,
    label: string,
    value: FormValue | undefined,
  ): ReactNode => {
    const current = typeof value === "string" ? value : "";
    let previewUrl: string | undefined;
    if (current !== "") {
      if (current.startsWith("http")) {
        previewUrl = current;
      } else if (current.startsWith("wix:image://")) {
        try {
          previewUrl = media.getScaledToFillImageUrl(current, 320, 320, {});
        } catch {
          previewUrl = undefined;
        }
      }
    }
    return (
      <FormField key={field.key} label={label}>
        <ImageViewer
          {...(previewUrl ? { imageUrl: previewUrl } : {})}
          width={240}
          height={160}
          onAddImage={() => {
            void pickImage(field.key);
          }}
          onUpdateImage={() => {
            void pickImage(field.key);
          }}
          onRemoveImage={() => handleFieldChange(field.key, "")}
        />
      </FormField>
    );
  };

  const renderReferenceField = (
    field: FieldConfig,
    label: string,
    value: FormValue | undefined,
  ): ReactNode => {
    const referencedId = field.referencedCollectionId;
    if (!referencedId) return null;
    const isLoading = refLoading[referencedId] === true;
    const cached = refOptions[referencedId];
    const NONE_ID = "__none__";
    const options = [
      { id: NONE_ID, value: "— None —" },
      ...(cached ?? []).map((opt) => ({ id: opt._id, value: opt.label })),
    ];
    const selected = typeof value === "string" && value !== "" ? value : NONE_ID;
    return (
      <FormField key={field.key} label={label}>
        {isLoading && !cached ? (
          <Loader size="tiny" />
        ) : (
          <Dropdown
            placeholder="Select"
            selectedId={selected}
            options={options}
            onSelect={(option) => {
              const id = option.id;
              if (id === NONE_ID || typeof id !== "string") {
                handleFieldChange(field.key, "");
              } else {
                handleFieldChange(field.key, id);
              }
            }}
          />
        )}
      </FormField>
    );
  };

  const renderMultiReferenceField = (
    field: FieldConfig,
    label: string,
    value: FormValue | undefined,
  ): ReactNode => {
    const referencedId = field.referencedCollectionId;
    if (!referencedId) return null;
    const isLoading = refLoading[referencedId] === true;
    const cached = refOptions[referencedId];
    const options = (cached ?? []).map((opt) => ({
      id: opt._id,
      value: opt.label,
    }));
    const selected: string[] = Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string")
      : [];
    return (
      <FormField key={field.key} label={label}>
        {isLoading && !cached ? (
          <Loader size="tiny" />
        ) : (
          <MultiSelectCheckbox
            options={options}
            selectedOptions={selected}
            placeholder="Select"
            onSelect={(optionId) => {
              if (typeof optionId !== "string") return;
              if (selected.includes(optionId)) return;
              handleFieldChange(field.key, [...selected, optionId]);
            }}
            onDeselect={(optionId) => {
              if (typeof optionId !== "string") return;
              handleFieldChange(
                field.key,
                selected.filter((id) => id !== optionId),
              );
            }}
          />
        )}
      </FormField>
    );
  };

  const renderEditor = (): ReactNode => {
    if (!editor) return null;
    const collection = getCollection(editor.collectionId);
    const canSave = areRequiredFilled(collection, editor.values) && !saving;
    const title =
      editor.mode === "add"
        ? `Add ${collection.itemNoun}`
        : `Edit ${collection.itemNoun}`;

    return (
      <Box
        direction="vertical"
        position="fixed"
        top="0"
        right="0"
        height="100vh"
        zIndex={1000}
      >
        <SidePanel
          closeButtonProps={{ onClick: closeEditor }}
          height="100vh"
        >
          <SidePanel.Header title={title} showDivider />
          <SidePanel.Content>
            <Box direction="vertical" gap="SP4">
              {collection.fields.map((field) => {
                const value = editor.values[field.key];
                const label = field.required
                  ? `${field.label} *`
                  : field.label;
                if (field.type === "textarea") {
                  return (
                    <FormField key={field.key} label={label}>
                      <InputArea
                        value={typeof value === "string" ? value : ""}
                        onChange={(e) =>
                          handleFieldChange(field.key, e.target.value)
                        }
                        rows={4}
                      />
                    </FormField>
                  );
                }
                if (field.type === "number") {
                  return (
                    <FormField key={field.key} label={label}>
                      <NumberInput
                        value={
                          typeof value === "number" || typeof value === "string"
                            ? value
                            : ""
                        }
                        onChange={(num, str) => {
                          if (str === "" || num === null || num === undefined) {
                            handleFieldChange(field.key, "");
                          } else {
                            handleFieldChange(field.key, num);
                          }
                        }}
                      />
                    </FormField>
                  );
                }
                if (field.type === "image") {
                  return renderImageField(field, label, value);
                }
                if (field.type === "reference") {
                  return renderReferenceField(field, label, value);
                }
                if (field.type === "multiReference") {
                  return renderMultiReferenceField(field, label, value);
                }
                return (
                  <FormField key={field.key} label={label}>
                    <Input
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) =>
                        handleFieldChange(field.key, e.target.value)
                      }
                    />
                  </FormField>
                );
              })}
            </Box>
          </SidePanel.Content>
          <SidePanel.Footer>
            <Box gap="SP2" align="right" width="100%">
              <Button
                priority="secondary"
                onClick={closeEditor}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  void handleSave();
                }}
                disabled={!canSave}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </Box>
          </SidePanel.Footer>
        </SidePanel>
      </Box>
    );
  };

  return (
    <WixDesignSystemProvider>
      <Page>
        <Page.Header
          title="Cats in Space — Content"
          subtitle="View and manage your CMS collections."
          actionsBar={
            <Box gap="SP2">
              <Button
                priority="secondary"
                prefixIcon={<Refresh />}
                onClick={() => {
                  void loadRows(activeId);
                }}
                disabled={loading}
              >
                Refresh
              </Button>
              <Button prefixIcon={<Add />} onClick={openAddEditor}>
                Add {activeCollection.itemNoun}
              </Button>
            </Box>
          }
        />
        <Page.Tail>
          <Tabs
            activeId={activeId}
            type="compactSide"
            items={COLLECTIONS.map((c) => ({ id: c.id, title: c.label }))}
            onClick={(item) => setActiveId(item.id as CollectionId)}
          />
        </Page.Tail>
        <Page.Content>{renderBody()}</Page.Content>
      </Page>
      {renderEditor()}
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
