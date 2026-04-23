"use client";

import * as React from "react";
import { Button } from "@/components/intel-ui/Button";
import { Input, Label } from "@/components/intel-ui/Field";
import { Modal } from "@/components/intel-ui/Modal";

export function SaveSearchModal({
  open,
  defaultName,
  onClose,
  onConfirm,
  saving,
}: {
  open: boolean;
  defaultName: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
  saving?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save this search"
      description="Give this estimate a memorable name. You can edit or delete it later from your dashboard."
    >
      {/* Keyed on `open` so the form's local state resets each time the modal re-opens. */}
      {open && (
        <SaveForm
          key={defaultName}
          defaultName={defaultName}
          onConfirm={onConfirm}
          onClose={onClose}
          saving={saving}
        />
      )}
    </Modal>
  );
}

function SaveForm({
  defaultName,
  onConfirm,
  onClose,
  saving,
}: {
  defaultName: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
  saving?: boolean;
}) {
  const [name, setName] = React.useState(defaultName);
  return (
    <>
      <Label htmlFor="search-name">Name</Label>
      <Input
        id="search-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. York city centre 2-bed"
        className="mt-1"
        autoFocus
      />
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(name)} loading={saving}>
          Save
        </Button>
      </div>
    </>
  );
}
