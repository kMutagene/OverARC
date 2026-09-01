# Sample decomposition conference demo

These three native ARC workspaces are independent, immutable starting points for
the conference screenshots. Run each command from the repository root.

```powershell
.\build.cmd Dev --workspace examples\sample-decomposition\s0-flat-sample
```

```powershell
.\build.cmd Dev --workspace examples\sample-decomposition\s1-source-process
```

```powershell
.\build.cmd Dev --workspace examples\sample-decomposition\s2-growth-extraction
```

On macOS or Linux, use `./build.sh` and forward the same slash-separated
workspace path. Relative paths are resolved from the repository root; absolute
paths are also accepted. Omitting `--workspace` retains
`examples/viewer-workspace` as the default.

`build.cmd Dev` starts the API and Vite as sibling processes. Their unprefixed
output remains interleaved in one console. `npm run dev` starts only Vite and
does not select or start an API workspace. Workspace selection is a startup
concern; there is no in-app picker.

## Screenshot sequence

1. In S0, use **Reset layout**, select **Sample**, and show its `Genotype = A+`
   and `Temperature = 30°C` assertions.
2. In S1, use **Reset layout**, select **Source plant**, and show the
   Source plant → Process → Sample chain with its `genotype = A+` annotation
   visible.
3. In S2, use **Reset layout**, select **Growth**, and show the Source plant →
   Growth → Grown plant → Extraction → Sample chain with the `30 °C`
   parameter visible.
4. Open **Mappings** in every workspace and confirm both the Genotype →
   `GENO:0000222` and Temperature → `PATO:0000146` rows.

Graph camera, layout, label, and PNG controls are grouped at the lower left of
the graph pane. Use **Show labels** to display every node and edge label and
**Hide labels** to return to the uncluttered view. Mapping actions are hidden in
browse mode; use **Enter curation mode** in the workspace sidebar when the demo
needs to expose **Map to term** buttons.

`A+` is a fictional genotype code, not a blood-type assertion and not a mapped
ontology term. Degree Celsius is registered directly as `UO:0000027`; the
complete `30°C` string is never mapped to the unit.
