import { useState } from "react";
import type { Api } from "../api/types";

export function DemoBanner({ api }: { api: Api }) {
  const [failing, setFailing] = useState(api.simulate?.isFailing() ?? false);
  return (
    <div role="note" className="border-b border-indigo-300 bg-indigo-50 px-4 py-2 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="font-medium">
          Demo mode: runs on an in-browser mock of the Laravel API; data stays in your browser
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={failing}
            onChange={(e) => {
              api.simulate?.setFailing(e.target.checked);
              setFailing(e.target.checked);
            }}
          />
          Simulate network failure (watch updates roll back)
        </label>
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => {
            api.simulate?.reset();
            window.location.reload();
          }}
        >
          Reset demo data
        </button>
      </div>
    </div>
  );
}
