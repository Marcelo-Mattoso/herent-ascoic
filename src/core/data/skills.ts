import { parse } from "yaml";
import yamlText from "../../data/skills.yaml?raw";
import type { SkillCatalog } from "./skillTypes";

export const SKILLS: SkillCatalog = parse(yamlText) as SkillCatalog;
