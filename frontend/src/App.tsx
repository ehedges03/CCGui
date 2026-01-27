import { useMemo, useState } from "react";
import { createConnectTransport } from "@connectrpc/connect-web";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { HelloService } from "@/gen/hello/v1/hello_connect";
import { Button } from "@/components/ui/button";

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});

export default function App() {
  const client = useMemo(() => createClient(HelloService, transport), []);
  const [aValue, setAValue] = useState("");
  const [bValue, setBValue] = useState("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSayHello() {
    setLoading(true);
    setError("");
    try {
      const request: { a?: number; b?: number } = {};
      if (aValue !== "") {
        const parsed = Number(aValue);
        if (Number.isNaN(parsed)) {
          setError("a must be a number");
          return;
        }
        request.a = parsed;
      }
      if (bValue !== "") {
        const parsed = Number(bValue);
        if (Number.isNaN(parsed)) {
          setError("b must be a number");
          return;
        }
        request.b = parsed;
      }

      const res = await client.say(request);
      setMessage(res.message ?? "");
    } catch (err) {
      const connectErr = ConnectError.from(err);
      if (connectErr.code === Code.InvalidArgument) {
        setError("a and b must be numbers");
        return;
      }
      if (connectErr.code === Code.OutOfRange) {
        setError("a * b is too large");
        return;
      }
      setError(connectErr.message);
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300" htmlFor="a">
              a
            </label>
            <input
              id="a"
              type="number"
              className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100"
              value={aValue}
              onChange={(event) => setAValue(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300" htmlFor="b">
              b
            </label>
            <input
              id="b"
              type="number"
              className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100"
              value={bValue}
              onChange={(event) => setBValue(event.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={onSayHello} disabled={loading}>
            {loading ? "Calling..." : "Multiply"}
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
