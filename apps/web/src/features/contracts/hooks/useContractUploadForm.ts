import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { Side } from "@codecash/contracts";
import { draftProblems } from "@codecash/contracts";
import { ApiError } from "@/shared/api/client";
import { platform } from "@/shared/api/platform";
import { getContractDraft, saveContractDraft } from "@/shared/api/domain";
import { emptyInputPatch } from "@/shared/ui/DemoFillButton";
import type {
  ContractDraft,
  ContractFile,
  DraftSigner,
  UploadFormOptions,
} from "../types";
import {
  FILE_MAX_BYTES,
  MAX_APPENDICES,
  contentKey,
  emptyDraft,
  fileKindOf,
  fillMissingSigners,
  sampleValues,
  signerProblem,
  type DraftInput,
} from "../lib/uploadDraft";

interface UseContractUploadFormInput {
  draft: ContractDraft;
  startBlank: boolean;
  options: UploadFormOptions;
  onPreviewFileChange?: (file: File) => void;
  onDraftChange?: (draft: DraftInput) => void;
}

/** State, validation and save/sample generation of the contract upload form (step 1 of the wizard). */
export function useContractUploadForm({
  draft,
  startBlank,
  options,
  onDraftChange,
  onPreviewFileChange,
}: UseContractUploadFormInput) {
  const { t, i18n } = useTranslation("contracts");
  const { t: tc } = useTranslation("common");
  const { t: td } = useTranslation("domain");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [value, setValue] = useState<DraftInput>(() =>
    startBlank ? emptyDraft(draft) : draft,
  );
  useEffect(() => {
    onDraftChange?.(value);
  }, [value, onDraftChange]);
  const [titleError, setTitleError] = useState(false);
  const [fileError, setFileError] = useState<"type" | "size" | null>(null);
  const [touched, setTouched] = useState(false);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const pendingFile = useRef<File | null>(null);
  const pendingAppendices = useRef<File[]>([]);
  const [appendixError, setAppendixError] = useState(false);
  const generatedContent = useRef<string | null>(null);
  const documentStale =
    generatedContent.current !== null &&
    generatedContent.current !== contentKey(value);
  const set = <K extends keyof DraftInput>(key: K, next: DraftInput[K]) => {
    setDirty((current) => ({ ...current, [key]: true }));
    setValue((current) => ({ ...current, [key]: next }));
  };
  const problems = draftProblems({
    ...value,
    graceDays: value.graceDays ?? Number.NaN,
  });
  if (!value.type) problems.type = "INVALID_TYPE";
  if (!value.approvalPolicy) problems.approvalPolicy = "INVALID_POLICY";
  if (!value.supplierId) problems.supplierId = "INVALID_SUPPLIER";
  if (!value.reviewerId) problems.reviewerId = "INVALID_REVIEWER";
  const feedback = (key: string) => ({
    validateStatus:
      (touched || dirty[key]) && problems[key] ? ("error" as const) : undefined,
    help:
      (touched || dirty[key]) && problems[key]
        ? td(`errors.${problems[key]}`)
        : undefined,
  });
  const placeholder = (key: string) =>
    t(`contractUpload.form.placeholders.${key}`);
  const setSigners = (signers: DraftSigner[]) => {
    set("signers", signers);
  };

  const supplierPeople = options.supplierSigners[value.supplierId] ?? [];
  const peopleFor = (party: Side) =>
    party === "BUYER" ? options.buyerSigners : supplierPeople;
  const problem = signerProblem(value.signers);

  const save = useMutation({
    mutationFn: async (input: ContractDraft) => {
      const saved = await saveContractDraft(input);
      if (pendingFile.current) {
        const upload = new FormData();
        upload.append("file", pendingFile.current);
        await platform.request(`/documents/${encodeURIComponent(saved.code)}`, {
          method: "POST",
          body: upload,
        });
        pendingFile.current = null;
        window.dispatchEvent(new Event("codecash:workflow-changed"));
      }
      for (const file of pendingAppendices.current) {
        const upload = new FormData();
        upload.append("file", file);
        await platform.request(
          `/documents/${encodeURIComponent(saved.code)}/appendices`,
          { method: "POST", body: upload },
        );
      }
      pendingAppendices.current = [];
      return getContractDraft(saved.code);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["contract-draft"] });
      await queryClient.invalidateQueries({ queryKey: ["contract-summaries"] });
      void navigate(`/contracts/${saved.code}/sign-positions`);
    },
  });

  const sample = useMutation({
    mutationFn: async () => {
      const input = validatedDraft();
      if (!input) throw new Error(tc("demoFill.completeFirst"));
      const result = await platform.post<{
        fileName: string;
        mimeType: string;
        pages?: number;
        base64: string;
      }>("/contract-samples", {
        draft: input,
        language: i18n.language.startsWith("vi") ? "vi" : "en",
      });
      const bytes = Uint8Array.from(atob(result.base64), (char) =>
        char.charCodeAt(0),
      );
      const file = new File([bytes], result.fileName, {
        type: result.mimeType,
      });
      return { input, file, pages: result.pages };
    },
    onSuccess: ({ input, file, pages }) => {
      generatedContent.current = contentKey(input);
      pendingFile.current = file;
      onPreviewFileChange?.(file);
      setFileError(null);
      setTitleError(false);
      setValue(() => ({
        ...input,
        title: input.title,
        file: { name: file.name, sizeBytes: file.size, kind: "DOCX", pages },
      }));
    },
  });

  function onReplaceFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    const kind = fileKindOf(chosen.name);
    if (!kind) return setFileError("type");
    if (chosen.size > FILE_MAX_BYTES) return setFileError("size");
    setFileError(null);
    generatedContent.current = null;
    pendingFile.current = chosen;
    onPreviewFileChange?.(chosen);
    set("file", {
      name: chosen.name,
      sizeBytes: chosen.size,
      kind,
    } satisfies ContractFile);
  }

  function onAddAppendix(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (
      files.some(
        (file) =>
          !fileKindOf(file.name) ||
          file.size === 0 ||
          file.size > FILE_MAX_BYTES,
      ) ||
      value.appendixNames.length + files.length > MAX_APPENDICES
    ) {
      setAppendixError(true);
      return;
    }
    setAppendixError(false);
    const additions = files.filter(
      (file, index) =>
        !value.appendixNames.includes(file.name) &&
        files.findIndex((other) => other.name === file.name) === index,
    );
    pendingAppendices.current.push(...additions);
    set("appendixNames", [
      ...value.appendixNames,
      ...additions.map((file) => file.name),
    ]);
  }

  function removeAppendix(name: string) {
    pendingAppendices.current = pendingAppendices.current.filter(
      (file) => file.name !== name,
    );
    set(
      "appendixNames",
      value.appendixNames.filter((existing) => existing !== name),
    );
  }

  function applyPreset(id: string) {
    const preset = options.presets.find((p) => p.id === id);
    if (!preset) return;
    const used = new Set<string>();
    const signers = preset.signers.map((signer) => {
      const person =
        signer.party === "SUPPLIER"
          ? supplierPeople.find((person) => !used.has(person.userId))
          : options.buyerSigners.find(
              (person) =>
                person.userId === signer.userId && !used.has(person.userId),
            );
      if (person) used.add(person.userId);
      return { ...signer, userId: person?.userId ?? "" };
    });
    setValue((current) => ({
      ...current,
      ...preset.defaults,
      templateId: preset.id,
      templateVersion: preset.version,
      templateSnapshot: undefined,
      signers,
    }));
  }

  function clearTemplate() {
    setValue((current) => ({
      ...current,
      templateId: undefined,
      templateVersion: undefined,
      templateSnapshot: undefined,
    }));
  }

  function move(index: number, by: -1 | 1) {
    const next = [...value.signers];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setSigners(next);
  }

  function changeSupplier(supplierId: string) {
    const allowed = options.supplierSigners[supplierId] ?? [];
    setValue((current) => ({
      ...current,
      supplierId,
      signers: current.signers.map((s) =>
        s.party === "SUPPLIER" &&
        !allowed.some((person) => person.userId === s.userId)
          ? { ...s, userId: "" }
          : s,
      ),
    }));
  }

  function validatedDraft(): ContractDraft | undefined {
    if (
      Object.keys(problems).length ||
      signerProblem(value.signers) ||
      !value.type ||
      !value.approvalPolicy ||
      value.graceDays === undefined
    )
      return;
    return {
      ...value,
      type: value.type,
      approvalPolicy: value.approvalPolicy,
      graceDays: value.graceDays,
      title: value.title.trim(),
    };
  }
  function fillAll() {
    const proposed = sampleValues(options, value, draft, t);
    setValue((current) => {
      const next = { ...current, ...emptyInputPatch(current, proposed) };
      return { ...next, signers: fillMissingSigners(next, options) };
    });
  }
  function onContinue() {
    setTouched(true);
    if (!value.title.trim()) {
      setTitleError(true);
      return;
    }
    if (
      Object.keys(problems).length ||
      problem ||
      !value.file.name ||
      documentStale
    )
      return;
    const input = validatedDraft();
    if (input) save.mutate(input);
  }

  const errorCode = save.error instanceof ApiError ? save.error.code : null;

  return {
    value,
    set,
    setValue,
    setSigners,
    problems,
    problem,
    feedback,
    placeholder,
    touched,
    titleError,
    setTitleError,
    fileError,
    appendixError,
    documentStale,
    pendingFile,
    peopleFor,
    save,
    sample,
    errorCode,
    onReplaceFile,
    onAddAppendix,
    removeAppendix,
    applyPreset,
    clearTemplate,
    move,
    changeSupplier,
    fillAll,
    onContinue,
  };
}

export type ContractUploadFormState = ReturnType<typeof useContractUploadForm>;
