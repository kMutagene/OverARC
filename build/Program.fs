open System
open System.Diagnostics
open System.IO
open System.Threading.Tasks
open Fake.Core
open Fake.Core.TargetOperators

// This FAKE entry point keeps restore/build/test/dev/publish behavior identical across local shells and CI.
let args = Environment.GetCommandLineArgs() |> Array.skip 1 |> Array.toList
let requestedTarget = args |> List.tryHead |> Option.defaultValue "Build"
let context = Context.FakeExecutionContext.Create false "build/Build.fsproj" []
Context.setExecutionContext (Context.RuntimeContext.Fake context)
Target.initEnvironment ()

let root = Path.GetFullPath(Path.Combine(__SOURCE_DIRECTORY__, ".."))
let solution = Path.Combine(root, "OverARC.slnx")
let web = root
let api = Path.Combine(root, "src", "OverARC.Api", "OverARC.Api.csproj")
let publishDirectory = Path.Combine(root, "artifacts", "publish")

/// Resolves npm to the Windows command shim while leaving native executable names unchanged elsewhere.
let resolveExecutable executable =
    if OperatingSystem.IsWindows() && executable = "npm" then
        let bundledNpm = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "npm.cmd")
        if File.Exists bundledNpm then bundledNpm else "npm.cmd"
    else executable

/// Runs one child process synchronously and fails the active FAKE target on a non-zero exit code.
let run executable arguments workingDirectory =
    let executable = resolveExecutable executable
    let info = ProcessStartInfo(executable, UseShellExecute = false, WorkingDirectory = workingDirectory)
    arguments |> List.iter info.ArgumentList.Add
    use child =
        Process.Start info
        |> Option.ofObj
        |> Option.defaultWith (fun () -> failwithf "Could not start %s" executable)
    child.WaitForExit()
    if child.ExitCode <> 0 then failwithf "%s exited with code %d" executable child.ExitCode

// Restore pins both .NET and npm dependencies before any reproducible build target.
Target.create "Restore" (fun _ ->
    run "dotnet" [ "restore"; solution ] root
    run "npm" [ "ci" ] web)

// Formatting targets centralize Prettier and ESLint behavior for local development and CI.
Target.create "Format" (fun _ -> run "npm" [ "run"; "format" ] web)
Target.create "FormatCheck" (fun _ ->
    run "npm" [ "run"; "format:check" ] web
    run "npm" [ "run"; "lint" ] web)

// Build compiles both server-side .NET projects and the production Vite bundle.
Target.create "Build" (fun _ ->
    run "dotnet" [ "build"; solution; "--no-restore" ] root
    run "npm" [ "run"; "build" ] web)

// Test covers API, frontend unit/performance, and live-server browser suites.
Target.create "Test" (fun _ ->
    run "dotnet" [ "test"; solution; "--no-build"; "--no-restore" ] root
    run "npm" [ "test" ] web
    run "npm" [ "run"; "test:browser" ] web)

// Publish emits the single ASP.NET server with its embedded frontend under artifacts.
Target.create "Publish" (fun _ ->
    run "dotnet" [ "publish"; api; "-c"; "Release"; "--no-restore"; "-o"; publishDirectory ] root)

// Dev runs the API and Vite processes together and tears down the survivor when either exits.
Target.create "Dev" (fun _ ->
    // Starts one long-lived development process without blocking the second process from launching.
    let start executable arguments workingDirectory =
        let executable = resolveExecutable executable
        let info = ProcessStartInfo(executable, UseShellExecute = false, WorkingDirectory = workingDirectory)
        arguments |> List.iter info.ArgumentList.Add
        Process.Start info
        |> Option.ofObj
        |> Option.defaultWith (fun () -> failwithf "Could not start %s" executable)
    use apiProcess = start "dotnet" [ "watch"; "--project"; api; "--no-hot-reload"; "--"; "--workspace"; Path.Combine(root, "examples", "viewer-workspace") ] root
    use webProcess = start "npm" [ "run"; "dev" ] web
    Task.WaitAny(apiProcess.WaitForExitAsync(), webProcess.WaitForExitAsync()) |> ignore
    if not apiProcess.HasExited then apiProcess.Kill(true)
    if not webProcess.HasExited then webProcess.Kill(true))

"Restore" ==> "FormatCheck" ==> "Build" |> ignore
"Restore" ==> "FormatCheck" ==> "Build" ==> "Test" |> ignore
"Restore" ==> "FormatCheck" ==> "Build" ==> "Publish" |> ignore
"Restore" ==> "Format" |> ignore
"Restore" ==> "Dev" |> ignore

Target.runOrDefault requestedTarget
