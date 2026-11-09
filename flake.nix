{
  description = "Flechettes — development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          # The toolchain. npm dependencies are still fetched from the npm
          # registry by `npm ci`; this shell only pins the tools around them.
          packages = [
            pkgs.nodejs_24 # node + npm + npx, matching the CI Node version
            pkgs.snyk # Snyk CLI — `snyk code test` (SAST), same as CI
            pkgs.cyclonedx-cli # inspect/convert/validate CycloneDX SBOMs
            pkgs.git
            pkgs.gh # GitHub CLI — PR status, checks, rulesets
            pkgs.jq
          ];

          shellHook = ''
            echo "flechettes dev shell — node $(node --version), npm $(npm --version)"
            echo "run: npm ci | npm run typecheck | npm test | npm run build | snyk code test"
          '';
        };
      });
    };
}
