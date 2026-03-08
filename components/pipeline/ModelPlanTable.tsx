'use client';

import type { ModelPlan } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { PIPELINE_STEP_NAMES } from '@/lib/utils';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface ModelPlanTableProps {
  modelPlan: ModelPlan;
}

export function ModelPlanTable({ modelPlan }: ModelPlanTableProps) {
  const hasIssues = modelPlan.missingCapabilities.length > 0;

  return (
    <div className="space-y-4">
      {hasIssues && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-sm font-medium text-destructive">Missing API Keys</p>
          </div>
          <ul className="space-y-1">
            {modelPlan.missingCapabilities.map((mc) => (
              <li key={mc.step} className="text-xs text-destructive/80">
                {PIPELINE_STEP_NAMES[mc.step] ?? mc.step}: requires {mc.capability} — add {mc.suggestedProvider} API key
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Step</th>
              <th className="text-left p-3 font-medium">Provider</th>
              <th className="text-left p-3 font-medium">Model</th>
              <th className="text-right p-3 font-medium">Est. Cost</th>
              <th className="text-center p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {modelPlan.steps.map((step) => (
              <tr key={step.step} className="border-b last:border-b-0">
                <td className="p-3 text-xs">{PIPELINE_STEP_NAMES[step.step] ?? step.step}</td>
                <td className="p-3">
                  <Badge variant="outline" className="text-xs capitalize">{step.provider}</Badge>
                </td>
                <td className="p-3 text-xs font-mono text-muted-foreground">{step.model}</td>
                <td className="p-3 text-right text-xs font-mono">${step.estimatedCostUsd.toFixed(4)}</td>
                <td className="p-3 text-center">
                  <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                </td>
              </tr>
            ))}
            {modelPlan.missingCapabilities.map((mc) => (
              <tr key={mc.step} className="border-b last:border-b-0 bg-destructive/5">
                <td className="p-3 text-xs">{PIPELINE_STEP_NAMES[mc.step] ?? mc.step}</td>
                <td className="p-3">
                  <Badge variant="destructive" className="text-xs">Missing</Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{mc.capability}</td>
                <td className="p-3 text-right text-xs">-</td>
                <td className="p-3 text-center">
                  <XCircle className="h-4 w-4 text-red-500 inline" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30">
              <td colSpan={3} className="p-3 font-medium text-sm">Total Estimated Cost</td>
              <td className="p-3 text-right font-mono font-bold">${modelPlan.totalEstimatedCostUsd.toFixed(4)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
