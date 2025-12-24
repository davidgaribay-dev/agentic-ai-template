/**
 * Test panel for testing guardrails against sample content.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, FlaskConical, ShieldCheck, ShieldAlert } from "lucide-react";

import { guardrailsApi, type GuardrailAction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface GuardrailTestPanelProps {
  orgId?: string;
  teamId?: string;
}

interface TestResult {
  passed: boolean;
  action: GuardrailAction | null;
  matches: { pattern: string; pattern_type: string; matched_text: string }[];
  redacted_content: string | null;
}

export function GuardrailTestPanel({ orgId, teamId }: GuardrailTestPanelProps) {
  const [content, setContent] = useState("");
  const [direction, setDirection] = useState<"input" | "output">("input");
  const [result, setResult] = useState<TestResult | null>(null);

  const testMutation = useMutation({
    mutationFn: () =>
      guardrailsApi.testGuardrails({ content, direction }, orgId, teamId),
    onSuccess: (data) => setResult(data),
  });

  const handleTest = () => {
    if (content.trim()) {
      testMutation.mutate();
    }
  };

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FlaskConical className="size-4" />
        Test Guardrails
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Enter content to test..."
        className="min-h-[80px]"
      />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm">Direction:</Label>
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as "input" | "output")}
          >
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="input">Input</SelectItem>
              <SelectItem value="output">Output</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={handleTest}
          disabled={!content.trim() || testMutation.isPending}
        >
          {testMutation.isPending ? (
            <Loader2 className="size-4 animate-spin mr-1" />
          ) : null}
          Test
        </Button>
      </div>

      {result && (
        <div
          className={cn(
            "p-2 rounded text-sm",
            result.passed
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            {result.passed ? (
              <>
                <ShieldCheck className="size-4" />
                Passed
              </>
            ) : (
              <>
                <ShieldAlert className="size-4" />
                {result.action === "block"
                  ? "Blocked"
                  : result.action === "redact"
                    ? "Would be redacted"
                    : "Warning triggered"}
              </>
            )}
          </div>
          {result.matches.length > 0 && (
            <div className="mt-2 text-xs">
              <strong>Matches:</strong>
              <ul className="list-disc list-inside mt-1">
                {result.matches.map((m, i) => (
                  <li key={i}>
                    <code className="bg-background px-1 rounded">
                      {m.matched_text}
                    </code>{" "}
                    ({m.pattern_type}: {m.pattern})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.redacted_content && (
            <div className="mt-2 text-xs">
              <strong>Redacted:</strong>
              <pre className="mt-1 p-2 bg-background rounded overflow-auto">
                {result.redacted_content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
