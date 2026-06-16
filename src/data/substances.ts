import substancesData from "../../data/substances.json";

export type SubstanceStructure = {
  smiles: string;
  compound: string;
  /** When true, the structure is a class representative rather than the substance itself. */
  representative?: boolean;
};

type SubstancesMap = Record<string, SubstanceStructure>;

const substances = substancesData as SubstancesMap;

export const SMILES_DRAWER_DOI =
  "https://pubs.acs.org/doi/10.1021/acs.jcim.7b00425";

export function getSubstanceStructure(
  key: string
): SubstanceStructure | undefined {
  return substances[key];
}

export function getSmilesForKey(key: string): string | undefined {
  return substances[key]?.smiles;
}
