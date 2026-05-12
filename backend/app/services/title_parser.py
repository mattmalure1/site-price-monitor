"""
Parse eBay listing titles to extract card identity fields.
Returns structured data with a parse_confidence score.
"""
import re
from dataclasses import dataclass, field
from typing import Optional

GRADERS = {
    "PSA": ["psa"],
    "CGC": ["cgc"],
    "BGS": ["bgs", "beckett"],
    "SGC": ["sgc"],
    "TAG": ["tag"],
}

GRADE_PATTERN = re.compile(
    r"\b(?:gem(?:\s*mint)?|pristine|perfect)?\s*(?:grade[d]?\s*)?(\d+(?:\.\d+)?)\s*(?:gem|mt|mint|pristine)?\b",
    re.IGNORECASE,
)

CARD_NUMBER_PATTERN = re.compile(r"\b(\d{1,3})/(\d{1,3}[a-z]?)\b", re.IGNORECASE)

LANGUAGE_KEYWORDS = {
    "Japanese": ["japanese", "japan", "jp", "holo jp"],
    "Korean": ["korean", "korea"],
    "Chinese": ["chinese", "china"],
}

VARIANTS = [
    "alt art", "alternate art", "full art", "rainbow rare", "secret rare",
    "gold rare", "hyper rare", "illustration rare", "special illustration rare",
    "trainer gallery", "radiant", "vmax", "vstar", "ex", "gx", "v",
    "shiny", "shining", "shimmering", "crystal", "star", "delta species",
    "first edition", "1st edition", "shadowless", "reverse holo", "holo",
]

HIGH_VALUE_POKEMON = {
    "charizard", "pikachu", "umbreon", "espeon", "rayquaza", "lugia", "mew",
    "mewtwo", "gengar", "blastoise", "venusaur", "eevee", "dragonite",
    "greninja", "raichu", "snorlax", "lapras", "dragonair", "gyarados",
    "vaporeon", "flareon", "jolteon", "sylveon", "leafeon", "glaceon",
}

RISK_TITLE_KEYWORDS = [
    "custom", "proxy", "metal", "gold card", "fan art", "reprint",
    "not psa", "not graded", "digital", "read description", "damaged slab",
    "cracked case", "cracked slab", "broken case",
]


@dataclass
class ParsedCard:
    game: str = "Pokemon"
    card_name: str = ""
    set_name: str = ""
    card_number: str = ""
    language: str = "English"
    grader: str = ""
    grade: Optional[float] = None
    cert_number: str = ""
    variant: str = ""
    parse_confidence: float = 0.0
    risk_flags: list = field(default_factory=list)
    image_flags: list = field(default_factory=list)


def parse_title(title: str) -> ParsedCard:
    result = ParsedCard()
    title_lower = title.lower()
    score = 0.0

    # Risk flags first — bail early signal
    for kw in RISK_TITLE_KEYWORDS:
        if kw in title_lower:
            result.risk_flags.append(f"Title contains '{kw}'")

    # Detect grader
    for grader_name, aliases in GRADERS.items():
        for alias in aliases:
            if re.search(rf"\b{re.escape(alias)}\b", title_lower):
                result.grader = grader_name
                score += 0.25
                break
        if result.grader:
            break

    # Detect grade number after grader
    if result.grader:
        grader_pos = title_lower.find(result.grader.lower())
        after_grader = title_lower[grader_pos:]
        grade_match = re.search(r"\b(10|9\.5|9|8\.5|8|7)\b", after_grader)
        if grade_match:
            result.grade = float(grade_match.group(1))
            score += 0.20

    # Detect card number (e.g. 215/203)
    num_match = CARD_NUMBER_PATTERN.search(title)
    if num_match:
        result.card_number = f"{num_match.group(1)}/{num_match.group(2)}"
        score += 0.20

    # Detect language
    for lang, keywords in LANGUAGE_KEYWORDS.items():
        for kw in keywords:
            if kw in title_lower:
                result.language = lang
                break

    # Detect variant
    detected_variants = []
    for v in VARIANTS:
        if v in title_lower:
            detected_variants.append(v)
    if detected_variants:
        result.variant = detected_variants[0]
        score += 0.05

    # Extract Pokémon name — heuristic: word before/after common game keywords
    card_name = _extract_pokemon_name(title)
    if card_name:
        result.card_name = card_name
        if card_name.lower() in HIGH_VALUE_POKEMON:
            score += 0.15
        else:
            score += 0.10

    # Confidence adjustments
    if not result.grader:
        score = max(0.0, score - 0.2)
    if not result.grade:
        score = max(0.0, score - 0.1)
    if result.risk_flags:
        score = max(0.0, score - 0.3)

    result.parse_confidence = min(1.0, score)
    return result


def _extract_pokemon_name(title: str) -> str:
    """
    Best-effort extraction of the Pokémon card name from title.
    Strips common noise words and looks for capitalized runs.
    """
    noise = {
        "pokemon", "pokémon", "psa", "cgc", "bgs", "sgc", "gem", "mint",
        "graded", "grade", "card", "holo", "rare", "sealed", "lot", "collection",
        "japanese", "english", "mint", "near", "nm", "ex", "vg",
    }
    # Remove card numbers
    title_clean = CARD_NUMBER_PATTERN.sub("", title)
    # Remove grade numbers
    title_clean = re.sub(r"\b\d+(?:\.\d+)?\b", "", title_clean)

    words = [w.strip("()[],.!") for w in title_clean.split()]
    name_parts = []
    for w in words:
        if w.lower() not in noise and len(w) > 1 and re.match(r"[A-Za-z]", w):
            name_parts.append(w.title())
        if len(name_parts) >= 4:
            break

    return " ".join(name_parts[:3]).strip()
