import { useMemo, useState } from "react";
import { createConnectTransport } from "@connectrpc/connect-web";
import { createPromiseClient } from "@connectrpc/connect";
import { HelloService } from "@/gen/hello/v1/hello_connect";
import { Button } from "@/components/ui/button";

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});

export default function App() {
  const client = useMemo(() => createPromiseClient(HelloService, transport), []);
  const [name, setName] = useState("world");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSayHello() {
    setLoading(true);
    setError("");
    try {
      const res = await client.say({ name });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">CCGui Template</h1>
          <p className="text-slate-300">
            ConnectRPC end-to-end type-safe API demo.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-300" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onSayHello} disabled={loading}>
            {loading ? "Calling..." : "Say hello"}
          </Button>
          {message ? <span className="text-slate-200">{message}</span> : null}
        </div>

        {error ? (
          <div className="rounded-md border border-rose-900 bg-rose-950/40 p-3 text-rose-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
