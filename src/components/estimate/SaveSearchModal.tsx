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
  const [name, setName] = React.useState(defaultName);

  React.useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save this search"
      description="Give this estimate a memorable name. You can edit or delete it later from your dashboard."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(name)} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <Label htmlFor="search-name">Name</Label>
      <Input
        id="search-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. York city centre 2-bed"
        className="mt-1"
        autoFocus
      />
    </Modal>
  );
}
