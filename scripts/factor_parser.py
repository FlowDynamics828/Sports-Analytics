import json
import re
import logging
from typing import List, Dict, Tuple, Optional, Union, Any
import datetime

# Configure logger
logger = logging.getLogger(__name__)

# Define the ParsedFactor and FactorCondition classes
class FactorCondition:
    """Represents a parsed condition extracted from a factor"""
    
    def __init__(self):
        self.text = ""
        self.type = "unknown"
        self.value = 0
        self.comparison_type = "="
        self.time_frame = None
        self.time_position = None
        self.is_negated = False
        self.confidence = 0.5
    
    def to_dict(self):
        """Convert to dictionary for serialization"""
        return {
            "text": self.text,
            "type": self.type,
            "value": self.value,
            "comparison_type": self.comparison_type,
            "time_frame": self.time_frame,
            "time_position": self.time_position,
            "is_negated": self.is_negated,
            "confidence": self.confidence
        }

class ParsedFactor:
    """Represents a fully parsed factor with all extracted components"""
    
    def __init__(self):
        self.raw_text = ""
        self.player = None
        self.team = None
        self.opponent = None
        self.league = None
        self.entity_type = "unknown"
        self.conditions = []
        self.condition_operator = "NONE"
        self.is_negated = False
        self.time_frame = None
        self.time_position = None
        self.confidence = 0.5
        self.parsing_time = None
    
    def to_dict(self):
        """Convert to dictionary for serialization"""
        return {
            "raw_text": self.raw_text,
            "player": self.player,
            "team": self.team,
            "opponent": self.opponent,
            "league": self.league,
            "entity_type": self.entity_type,
            "conditions": [c.to_dict() for c in self.conditions],
            "condition_operator": self.condition_operator,
            "is_negated": self.is_negated,
            "time_frame": self.time_frame,
            "time_position": self.time_position,
            "confidence": self.confidence,
            "parsing_time": self.parsing_time.isoformat() if self.parsing_time else None
        }


class LRUCache:
    """Least Recently Used (LRU) cache for parsed results"""
    
    def __init__(self, capacity: int):
        """Initialize the LRU cache with a fixed capacity
        
        Args:
            capacity: Maximum number of items to store in the cache
        """
        self.capacity = capacity
        self.cache = {}
        self.order = []
    
    def get(self, key: str):
        """Get an item from the cache and update its position
        
        Args:
            key: Cache key to retrieve
            
        Returns:
            The cached value or None if not found
        """
        if key not in self.cache:
            return None
        
        # Update position by removing and re-adding to end (most recently used)
        self.order.remove(key)
        self.order.append(key)
        
        return self.cache[key]
    
    def put(self, key: str, value):
        """Add or update an item in the cache
        
        Args:
            key: Cache key
            value: Value to store
        """
        # If key exists, update its position
        if key in self.cache:
            self.order.remove(key)
        # If at capacity, remove least recently used item
        elif len(self.cache) >= self.capacity:
            oldest = self.order.pop(0)
            del self.cache[oldest]
        
        # Add new item
        self.cache[key] = value
        self.order.append(key)
    
    def clear(self):
        """Clear the cache"""
        self.cache = {}
        self.order = []
    
    def __len__(self):
        """Get the current size of the cache"""
        return len(self.cache)


class CompoundConditionParser:
    """Parser for complex compound conditions with multiple clauses"""
    
    def __init__(self, nlp=None):
        """Initialize the compound condition parser
        
        Args:
            nlp: Optional spaCy NLP model
        """
        self.nlp = nlp
        self.conjunction_patterns = {
            "AND": [
                r'\band\b',
                r'\bwhile\b',
                r'\bas well as\b',
                r'\balong with\b',
                r'\bin addition to\b',
                r'\bplus\b',
                r'\balso\b',
                r'\btogether with\b'
            ],
            "OR": [
                r'\bor\b',
                r'\beither\b',
                r'\balternatively\b',
                r'\botherwise\b'
            ],
            "BUT": [
                r'\bbut\b',
                r'\bhowever\b',
                r'\byet\b',
                r'\balthough\b',
                r'\bdespite\b'
            ],
            "IF": [
                r'\bif\b',
                r'\bwhen\b',
                r'\bprovided that\b',
                r'\bassuming\b',
                r'\bin case\b'
            ]
        }
    
    def split_compound_statement(self, text: str) -> dict:
        """Split a compound statement into its component parts
        
        Args:
            text: The compound statement to split
            
        Returns:
            Dictionary with operator type and list of clauses
        """
        if not text:
            return {"operator": "NONE", "clauses": [text]}
        
        # Use dependency parsing if available
        if self.nlp:
            return self._split_with_nlp(text)
        
        # Fallback to regex-based splitting
        return self._split_with_regex(text)
    
    def _split_with_nlp(self, text: str) -> dict:
        """Split compound statement using NLP dependency parsing
        
        Args:
            text: The compound statement to split
            
        Returns:
            Dictionary with operator type and list of clauses
        """
        doc = self.nlp(text)
        
        # Identify main conjunctions and their types
        conjunctions = []
        for token in doc:
            if token.dep_ == "cc" or token.pos_ == "CCONJ":
                conj_type = self._identify_conjunction_type(token.text.lower())
                if conj_type:
                    conjunctions.append((token.i, conj_type))
        
        # If no conjunctions found, return original text
        if not conjunctions:
            return {"operator": "NONE", "clauses": [text]}
        
        # Sort conjunctions by position
        conjunctions.sort(key=lambda x: x[0])
        
        # Get the dominant conjunction type
        dominant_type = conjunctions[0][1] if conjunctions else "NONE"
        
        # Split text at conjunction positions
        clauses = []
        start_idx = 0
        
        for conj_idx, _ in conjunctions:
            # Get the text before the conjunction
            end_idx = doc[conj_idx].idx
            if end_idx > start_idx:
                clause = text[start_idx:end_idx].strip()
                if clause:
                    clauses.append(clause)
            
            # Update start index to after the conjunction
            start_idx = doc[conj_idx].idx + len(doc[conj_idx].text)
        
        # Add the final clause
        if start_idx < len(text):
            final_clause = text[start_idx:].strip()
            if final_clause:
                clauses.append(final_clause)
        
        # Filter out empty clauses
        clauses = [c for c in clauses if c]
        
        # If still no clauses, return original text
        if not clauses:
            return {"operator": "NONE", "clauses": [text]}
        
        return {"operator": dominant_type, "clauses": clauses}
    
    def _split_with_regex(self, text: str) -> dict:
        """Split compound statement using regex pattern matching
        
        Args:
            text: The compound statement to split
            
        Returns:
            Dictionary with operator type and list of clauses
        """
        # Check for each conjunction type
        for operator, patterns in self.conjunction_patterns.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    # Split by this pattern
                    clauses = re.split(pattern, text, flags=re.IGNORECASE)
                    # Clean up clauses
                    clauses = [c.strip() for c in clauses if c.strip()]
                    
                    if len(clauses) > 1:
                        return {"operator": operator, "clauses": clauses}
        
        # No conjunction found
        return {"operator": "NONE", "clauses": [text]}
    
    def _identify_conjunction_type(self, conj_text: str) -> str:
        """Identify the type of conjunction
        
        Args:
            conj_text: The conjunction text
            
        Returns:
            The conjunction type (AND, OR, BUT, IF) or None
        """
        conj_text = conj_text.lower()
        
        for conj_type, patterns in self.conjunction_patterns.items():
            for pattern in patterns:
                # Remove regex markers
                clean_pattern = pattern.replace(r'\b', '').lower()
                if conj_text == clean_pattern:
                    return conj_type
        
        return None


class AdvancedNegationDetector:
    """Advanced negation detection for sports predictions"""
    
    def __init__(self, nlp=None, transformer_model=None):
        """Initialize the negation detector
        
        Args:
            nlp: Optional spaCy NLP model
            transformer_model: Optional transformer-based model
        """
        self.nlp = nlp
        self.transformer_model = transformer_model
        
        # Common negation patterns in sports contexts
        self.negation_terms = [
            "not", "n't", "don't", "doesn't", "won't", "isn't", "aren't", "didn't",
            "no", "never", "nobody", "none", "nothing", "nowhere", "neither", "nor",
            "fails to", "unable to", "can't", "cannot", "couldn't", "shouldn't", 
            "without", "unlikely", "prevent", "stops", "lack", "lacks", "fails", 
            "miss", "misses", "avoided", "avoids", "denied", "denies"
        ]
        
        # Scope modifiers that can change negation scope
        self.scope_modifiers = [
            "but", "however", "although", "though", "except", "despite", 
            "in spite of", "nonetheless", "nevertheless", "regardless", 
            "notwithstanding", "yet", "still", "even so", "all the same"
        ]
    
    def detect_negation(self, text: str) -> dict:
        """Detect negation in text with scope analysis
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with negation information
        """
        # Use transformer model if available (most accurate)
        if self.transformer_model:
            return self._detect_with_transformer(text)
        
        # Use spaCy if available
        if self.nlp:
            return self._detect_with_spacy(text)
        
        # Fallback to pattern matching
        return self._detect_with_patterns(text)
    
    def _detect_with_transformer(self, text: str) -> dict:
        """Detect negation using transformer-based model
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with negation information
        """
        try:
            result = self.transformer_model(text)
            
            is_negated = False
            confidence = 0.5
            
            # Parse model output
            if hasattr(result, '__getitem__') and len(result) > 0:
                label = result[0].get('label', '')
                score = result[0].get('score', 0.5)
                
                is_negated = label == 'NEG' or 'negation' in label.lower()
                confidence = score
            
            return {
                "is_negated": is_negated,
                "confidence": confidence,
                "scope": text,  # Full text as scope with transformer model
                "method": "transformer"
            }
        
        except Exception as e:
            logger.error(f"Error in transformer-based negation detection: {str(e)}")
            # Fallback to pattern matching
            return self._detect_with_patterns(text)
    
    def _detect_with_spacy(self, text: str) -> dict:
        """Detect negation using spaCy dependency parsing
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with negation information
        """
        doc = self.nlp(text)
        
        # Check for negation markers
        negation_tokens = []
        for token in doc:
            # Check for direct negation
            if (token.dep_ == "neg" or 
                token.lower_ in self.negation_terms or 
                token.lemma_ in self.negation_terms):
                negation_tokens.append(token)
        
        if not negation_tokens:
            return {
                "is_negated": False,
                "confidence": 0.9,
                "scope": None,
                "method": "spacy"
            }
        
        # Determine negation scope
        scopes = []
        for neg_token in negation_tokens:
            # Find the scope of negation (usually the parent of negation token and its subtree)
            if neg_token.dep_ == "neg":
                # Direct negation
                head = neg_token.head
                scope_start = min(token.i for token in head.subtree)
                scope_end = max(token.i for token in head.subtree)
                
                # Create scope text
                scope_text = doc[scope_start:scope_end+1].text
                scopes.append(scope_text)
            else:
                # Negation word not marked as "neg" dependency
                # Take a window of tokens before and after
                window_size = 5
                start = max(0, neg_token.i - window_size)
                end = min(len(doc), neg_token.i + window_size + 1)
                scope_text = doc[start:end].text
                scopes.append(scope_text)
        
        # Check for scope modifiers that might restrict negation
        has_scope_modifier = any(modifier in text.lower() for modifier in self.scope_modifiers)
        
        # Determine confidence based on analysis
        if has_scope_modifier:
            confidence = 0.7  # Lower confidence if scope modifiers are present
        else:
            confidence = 0.9  # Higher confidence for clear negation
        
        return {
            "is_negated": True,
            "confidence": confidence,
            "scope": scopes,
            "has_scope_modifier": has_scope_modifier,
            "method": "spacy"
        }
    
    def _detect_with_patterns(self, text: str) -> dict:
        """Detect negation using pattern matching
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with negation information
        """
        text_lower = text.lower()
        
        # Check for negation words
        has_negation = any(neg_term in text_lower.split() or 
                           f" {neg_term} " in f" {text_lower} " or
                           f" {neg_term}." in f" {text_lower} " or
                           f" {neg_term}," in f" {text_lower} "
                           for neg_term in self.negation_terms)
        
        if not has_negation:
            return {
                "is_negated": False,
                "confidence": 0.7,  # Lower confidence with pattern matching
                "scope": None,
                "method": "pattern"
            }
        
        # Simple scope identification - find sentences containing negation terms
        import nltk
        try:
            sentences = nltk.sent_tokenize(text)
            negated_sentences = [
                sentence for sentence in sentences
                if any(neg_term in sentence.lower() for neg_term in self.negation_terms)
            ]
            
            # Check for scope modifiers
            has_scope_modifier = any(modifier in text_lower for modifier in self.scope_modifiers)
            
            # Lower confidence with pattern matching
            confidence = 0.6 if has_scope_modifier else 0.7
            
            return {
                "is_negated": True,
                "confidence": confidence,
                "scope": negated_sentences,
                "has_scope_modifier": has_scope_modifier,
                "method": "pattern"
            }
        except:
            # Ultra-simple fallback
            return {
                "is_negated": True,
                "confidence": 0.6,
                "scope": text,
                "method": "simple_pattern"
            }


class AdvancedTimeFrameDetector:
    """Advanced time frame detection for sports predictions"""
    
    def __init__(self, nlp=None):
        """Initialize the time frame detector
        
        Args:
            nlp: Optional spaCy NLP model
        """
        self.nlp = nlp
        
        # Standard time frames in sports
        self.time_frames = {
            "game": ["game", "match", "contest", "fixture", "matchup", "meeting", "faceoff", "showdown", "bout"],
            "half": ["half", "halftime", "half-time", "half time", "1st half", "2nd half", "first half", "second half", "halves"],
            "quarter": ["quarter", "1st quarter", "2nd quarter", "3rd quarter", "4th quarter", "first quarter", "second quarter", "third quarter", "fourth quarter", "q1", "q2", "q3", "q4"],
            "period": ["period", "1st period", "2nd period", "3rd period", "first period", "second period", "third period", "p1", "p2", "p3"],
            "inning": ["inning", "innings", "1st inning", "2nd inning", "top of the inning", "bottom of the inning", "frame"],
            "season": ["season", "year", "regular season", "campaign", "this season", "current season", "last season", "prior season", "off-season", "preseason"],
            "month": ["month", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
            "week": ["week", "gameweek", "match week", "matchweek", "week 1", "week 2", "week 3", "week 4", "week 5", "week 6", "week 7"],
            "tournament": ["tournament", "competition", "cup", "championship", "series", "playoffs", "finals", "semi-finals", "quarterfinals", "group stage", "knockout stage"],
            "overtime": ["overtime", "ot", "extra time", "et", "supplementary time", "added time", "injury time", "stoppage time", "additional time"],
            "shootout": ["shootout", "penalty shootout", "penalties", "penalty kicks"],
            "specific": ["minute", "minutes", "min", "mins", "second", "seconds", "sec", "secs"],
            "career": ["career", "lifetime", "entire career", "all-time", "career total", "career stats", "legacy"],
            "stretch": ["stretch", "run", "streak", "span", "recent games", "last few games", "upcoming games", "next few games", "road trip", "home stand", "winning streak", "losing streak"]
        }
        
        # Time positions (modifiers)
        self.time_positions = {
            "first": ["first", "1st", "opening", "start", "early", "beginning", "initial", "earliest", "starting"],
            "second": ["second", "2nd", "mid", "middle", "halfway", "midway"],
            "third": ["third", "3rd"],
            "fourth": ["fourth", "4th"],
            "fifth": ["fifth", "5th"],
            "sixth": ["sixth", "6th"],
            "seventh": ["seventh", "7th"],
            "eighth": ["eighth", "8th"],
            "ninth": ["ninth", "9th"],
            "last": ["last", "final", "ending", "close", "late", "closing", "finish", "concluding", "latter"],
            "entire": ["entire", "whole", "full", "complete", "all", "throughout", "overall", "total"],
            "current": ["current", "ongoing", "present", "this", "active", "existing", "now"],
            "upcoming": ["upcoming", "next", "future", "coming", "approaching", "forthcoming", "imminent"],
            "past": ["past", "previous", "recent", "earlier", "prior", "former", "preceding", "finished"]
        }
        
        # Time quantifiers
        self.time_quantifiers = {
            "single": ["a", "one", "single", "individual", "specific", "particular"],
            "couple": ["couple", "two", "pair", "duo"],
            "few": ["few", "several", "some", "handful"],
            "many": ["many", "multiple", "numerous", "various", "lot", "lots"],
            "all": ["all", "every", "each", "any"],
            "most": ["most", "majority", "bulk", "greater part"],
            "exact": list(map(str, range(1, 21)))  # Numbers 1-20 as strings
        }
    
    def detect_time_frame(self, text: str) -> dict:
        """Detect time frames in text
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with time frame information
        """
        # Use spaCy for advanced detection if available
        if self.nlp:
            return self._detect_with_spacy(text)
        
        # Fallback to pattern matching
        return self._detect_with_patterns(text)
    
    def _detect_with_spacy(self, text: str) -> dict:
        """Detect time frames using spaCy NLP
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with time frame information
        """
        doc = self.nlp(text)
        
        # Initialize results
        result = {
            "primary_frame": None,
            "position": None,
            "quantifier": None,
            "specific_value": None,
            "temporal_phrases": [],
            "confidence": 0.5
        }
        
        # Identify time-related entities
        for ent in doc.ents:
            if ent.label_ in ["DATE", "TIME"]:
                result["temporal_phrases"].append(ent.text)
        
        # Look for time frame terms
        time_frames_found = {}
        for frame_type, patterns in self.time_frames.items():
            for pattern in patterns:
                if pattern in text.lower():
                    if frame_type not in time_frames_found:
                        time_frames_found[frame_type] = []
                    time_frames_found[frame_type].append(pattern)
        
        # Look for position modifiers
        positions_found = {}
        for position_type, patterns in self.time_positions.items():
            for pattern in patterns:
                if pattern in text.lower():
                    if position_type not in positions_found:
                        positions_found[position_type] = []
                    positions_found[position_type].append(pattern)
        
        # Look for quantifiers
        quantifiers_found = {}
        for quantifier_type, patterns in self.time_quantifiers.items():
            for pattern in patterns:
                if pattern in text.lower().split() or f" {pattern} " in f" {text.lower()} ":
                    if quantifier_type not in quantifiers_found:
                        quantifiers_found[quantifier_type] = []
                    quantifiers_found[quantifier_type].append(pattern)
        
        # Extract specific numeric values related to time
        specific_values = []
        for token in doc:
            if token.like_num:
                # Check if adjacent tokens include time units
                time_units = ["minute", "minutes", "min", "mins", "second", "seconds", "sec", "secs", 
                             "game", "games", "match", "matches", "quarter", "quarters", "half", "halves", 
                             "period", "periods", "inning", "innings", "season", "seasons", "week", "weeks"]
                
                # Check next 2 tokens
                next_tokens = [doc[i].text.lower() for i in range(token.i + 1, min(token.i + 3, len(doc)))]
                
                # Check if any time unit appears in next tokens
                if any(unit in next_tokens for unit in time_units):
                    specific_values.append((token.text, "".join(next_tokens[:2])))
        
        # Set the primary time frame (prioritizing more specific frames)
        if time_frames_found:
            # Priority order for time frames
            priority_order = ["specific", "minute", "quarter", "half", "period", "inning", 
                             "overtime", "shootout", "game", "week", "month", "season", 
                             "tournament", "career", "stretch"]
            
            # Find the highest priority time frame
            for frame in priority_order:
                if frame in time_frames_found:
                    result["primary_frame"] = frame
                    break
            
            # If no priority frame found, use the first one
            if not result["primary_frame"] and time_frames_found:
                result["primary_frame"] = list(time_frames_found.keys())[0]
        
        # Set the position modifier
        if positions_found:
            # Use the first position found
            result["position"] = list(positions_found.keys())[0]
        
        # Set the quantifier
        if quantifiers_found:
            # Use the first quantifier found
            result["quantifier"] = list(quantifiers_found.keys())[0]
        
        # Set specific numeric values
        if specific_values:
            result["specific_value"] = specific_values[0]
        
        # Calculate confidence based on the quality of detection
        confidence = 0.5  # Base confidence
        
        if result["primary_frame"]:
            confidence += 0.2
        
        if result["position"]:
            confidence += 0.1
        
        if result["specific_value"]:
            confidence += 0.2
        
        if len(result["temporal_phrases"]) > 0:
            confidence += 0.1
        
        # Cap confidence at 0.95
        result["confidence"] = min(confidence, 0.95)
        
        return result
    
    def _detect_with_patterns(self, text: str) -> dict:
        """Detect time frames using pattern matching
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with time frame information
        """
        text_lower = text.lower()
        
        # Initialize results
        result = {
            "primary_frame": None,
            "position": None,
            "quantifier": None,
            "specific_value": None,
            "confidence": 0.5
        }
        
        # Look for time frame terms
        time_frames_found = {}
        for frame_type, patterns in self.time_frames.items():
            for pattern in patterns:
                if pattern in text_lower:
                    if frame_type not in time_frames_found:
                        time_frames_found[frame_type] = []
                    time_frames_found[frame_type].append(pattern)
        
        # Look for position modifiers
        positions_found = {}
        for position_type, patterns in self.time_positions.items():
            for pattern in patterns:
                if pattern in text_lower:
                    if position_type not in positions_found:
                        positions_found[position_type] = []
                    positions_found[position_type].append(pattern)
        
        # Look for quantifiers
        quantifiers_found = {}
        for quantifier_type, patterns in self.time_quantifiers.items():
            for pattern in patterns:
                if pattern in text_lower.split() or f" {pattern} " in f" {text_lower} ":
                    if quantifier_type not in quantifiers_found:
                        quantifiers_found[quantifier_type] = []
                    quantifiers_found[quantifier_type].append(pattern)
        
        # Extract specific numeric values related to time with simple regex
        specific_values = []
        numeric_pattern = r'(\d+)\s+(minute|minutes|min|mins|second|seconds|sec|secs|game|games|match|matches|quarter|quarters|half|halves|period|periods|inning|innings|season|seasons|week|weeks)'
        matches = re.findall(numeric_pattern, text_lower)
        if matches:
            specific_values = matches
        
        # Set the primary time frame (prioritizing more specific frames)
        if time_frames_found:
            # Priority order for time frames (same as in spaCy method)
            priority_order = ["specific", "minute", "quarter", "half", "period", "inning", 
                             "overtime", "shootout", "game", "week", "month", "season", 
                             "tournament", "career", "stretch"]
            
            # Find the highest priority time frame
            for frame in priority_order:
                if frame in time_frames_found:
                    result["primary_frame"] = frame
                    break
            
            # If no priority frame found, use the first one
            if not result["primary_frame"] and time_frames_found:
                result["primary_frame"] = list(time_frames_found.keys())[0]
        
        # Set the position modifier
        if positions_found:
            result["position"] = list(positions_found.keys())[0]
        
        # Set the quantifier
        if quantifiers_found:
            result["quantifier"] = list(quantifiers_found.keys())[0]
        
        # Set specific numeric values
        if specific_values:
            result["specific_value"] = specific_values[0]
        
        # Calculate confidence (lower than spaCy method)
        confidence = 0.4  # Lower base confidence
        
        if result["primary_frame"]:
            confidence += 0.2
        
        if result["position"]:
            confidence += 0.1
        
        if result["specific_value"]:
            confidence += 0.2
        
        # Cap confidence at 0.85 (lower than spaCy)
        result["confidence"] = min(confidence, 0.85)
        
        return result
    
    def _get_default_teams(self):
        """Get comprehensive teams data for all 8 primary leagues"""
        return {
            # NBA Teams (All 30 teams)
            "lakers": {"id": "LAL", "name": "Los Angeles Lakers", "league": "NBA", "aliases": ["Lakers", "LA Lakers"]},
            "celtics": {"id": "BOS", "name": "Boston Celtics", "league": "NBA", "aliases": ["Celtics"]},
            "warriors": {"id": "GSW", "name": "Golden State Warriors", "league": "NBA", "aliases": ["Warriors", "GSW", "Golden State", "Dubs"]},
            "bucks": {"id": "MIL", "name": "Milwaukee Bucks", "league": "NBA", "aliases": ["Bucks"]},
            "nuggets": {"id": "DEN", "name": "Denver Nuggets", "league": "NBA", "aliases": ["Nuggets"]},
            "heat": {"id": "MIA", "name": "Miami Heat", "league": "NBA", "aliases": ["Heat"]},
            "suns": {"id": "PHX", "name": "Phoenix Suns", "league": "NBA", "aliases": ["Suns"]},
            "mavs": {"id": "DAL", "name": "Dallas Mavericks", "league": "NBA", "aliases": ["Mavs", "Mavericks"]},
            "knicks": {"id": "NYK", "name": "New York Knicks", "league": "NBA", "aliases": ["Knicks"]},
            "sixers": {"id": "PHI", "name": "Philadelphia 76ers", "league": "NBA", "aliases": ["76ers", "Sixers"]},
            "cavaliers": {"id": "CLE", "name": "Cleveland Cavaliers", "league": "NBA", "aliases": ["Cavs", "Cavaliers"]},
            "thunder": {"id": "OKC", "name": "Oklahoma City Thunder", "league": "NBA", "aliases": ["Thunder", "OKC"]},
            "clippers": {"id": "LAC", "name": "Los Angeles Clippers", "league": "NBA", "aliases": ["Clippers", "LA Clippers"]},
            "timberwolves": {"id": "MIN", "name": "Minnesota Timberwolves", "league": "NBA", "aliases": ["Wolves", "T-Wolves", "Timberwolves"]},
            "pelicans": {"id": "NOP", "name": "New Orleans Pelicans", "league": "NBA", "aliases": ["Pelicans", "Pels"]},
            "kings": {"id": "SAC", "name": "Sacramento Kings", "league": "NBA", "aliases": ["Kings"]},
            "rockets": {"id": "HOU", "name": "Houston Rockets", "league": "NBA", "aliases": ["Rockets"]},
            "magic": {"id": "ORL", "name": "Orlando Magic", "league": "NBA", "aliases": ["Magic"]},
            "pacers": {"id": "IND", "name": "Indiana Pacers", "league": "NBA", "aliases": ["Pacers"]},
            "nets": {"id": "BKN", "name": "Brooklyn Nets", "league": "NBA", "aliases": ["Nets"]},
            "raptors": {"id": "TOR", "name": "Toronto Raptors", "league": "NBA", "aliases": ["Raptors"]},
            "bulls": {"id": "CHI", "name": "Chicago Bulls", "league": "NBA", "aliases": ["Bulls"]},
            "hawks": {"id": "ATL", "name": "Atlanta Hawks", "league": "NBA", "aliases": ["Hawks"]},
            "wizards": {"id": "WAS", "name": "Washington Wizards", "league": "NBA", "aliases": ["Wizards"]},
            "grizzlies": {"id": "MEM", "name": "Memphis Grizzlies", "league": "NBA", "aliases": ["Grizzlies", "Grizz"]},
            "spurs": {"id": "SAS", "name": "San Antonio Spurs", "league": "NBA", "aliases": ["Spurs"]},
            "hornets": {"id": "CHA", "name": "Charlotte Hornets", "league": "NBA", "aliases": ["Hornets"]},
            "jazz": {"id": "UTA", "name": "Utah Jazz", "league": "NBA", "aliases": ["Jazz"]},
            "trailblazers": {"id": "POR", "name": "Portland Trail Blazers", "league": "NBA", "aliases": ["Blazers", "Trail Blazers"]},
            "pistons": {"id": "DET", "name": "Detroit Pistons", "league": "NBA", "aliases": ["Pistons"]},
            
            # NFL Teams (All 32 teams)
            "chiefs": {"id": "KC", "name": "Kansas City Chiefs", "league": "NFL", "aliases": ["Chiefs", "KC Chiefs"]},
            "eagles": {"id": "PHI", "name": "Philadelphia Eagles", "league": "NFL", "aliases": ["Eagles"]},
            "cowboys": {"id": "DAL", "name": "Dallas Cowboys", "league": "NFL", "aliases": ["Cowboys"]},
            "49ers": {"id": "SF", "name": "San Francisco 49ers", "league": "NFL", "aliases": ["49ers", "Niners", "San Francisco"]},
            "bills": {"id": "BUF", "name": "Buffalo Bills", "league": "NFL", "aliases": ["Bills"]},
            "packers": {"id": "GB", "name": "Green Bay Packers", "league": "NFL", "aliases": ["Packers", "Green Bay"]},
            "ravens": {"id": "BAL", "name": "Baltimore Ravens", "league": "NFL", "aliases": ["Ravens"]},
            "bengals": {"id": "CIN", "name": "Cincinnati Bengals", "league": "NFL", "aliases": ["Bengals"]},
            "lions": {"id": "DET", "name": "Detroit Lions", "league": "NFL", "aliases": ["Lions"]},
            "patriots": {"id": "NE", "name": "New England Patriots", "league": "NFL", "aliases": ["Patriots", "Pats", "New England"]},
            "steelers": {"id": "PIT", "name": "Pittsburgh Steelers", "league": "NFL", "aliases": ["Steelers"]},
            "buccaneers": {"id": "TB", "name": "Tampa Bay Buccaneers", "league": "NFL", "aliases": ["Bucs", "Buccaneers", "Tampa Bay"]},
            "rams": {"id": "LAR", "name": "Los Angeles Rams", "league": "NFL", "aliases": ["Rams", "LA Rams"]},
            "vikings": {"id": "MIN", "name": "Minnesota Vikings", "league": "NFL", "aliases": ["Vikings"]},
            "texans": {"id": "HOU", "name": "Houston Texans", "league": "NFL", "aliases": ["Texans"]},
            "colts": {"id": "IND", "name": "Indianapolis Colts", "league": "NFL", "aliases": ["Colts"]},
            "saints": {"id": "NO", "name": "New Orleans Saints", "league": "NFL", "aliases": ["Saints"]},
            "falcons": {"id": "ATL", "name": "Atlanta Falcons", "league": "NFL", "aliases": ["Falcons"]},
            "seahawks": {"id": "SEA", "name": "Seattle Seahawks", "league": "NFL", "aliases": ["Seahawks"]},
            "raiders": {"id": "LV", "name": "Las Vegas Raiders", "league": "NFL", "aliases": ["Raiders"]},
            "broncos": {"id": "DEN", "name": "Denver Broncos", "league": "NFL", "aliases": ["Broncos"]},
            "chargers": {"id": "LAC", "name": "Los Angeles Chargers", "league": "NFL", "aliases": ["Chargers", "LA Chargers"]},
            "browns": {"id": "CLE", "name": "Cleveland Browns", "league": "NFL", "aliases": ["Browns"]},
            "cardinals": {"id": "ARI", "name": "Arizona Cardinals", "league": "NFL", "aliases": ["Cardinals", "Cards"]},
            "jaguars": {"id": "JAX", "name": "Jacksonville Jaguars", "league": "NFL", "aliases": ["Jaguars", "Jags"]},
            "bears": {"id": "CHI", "name": "Chicago Bears", "league": "NFL", "aliases": ["Bears"]},
            "giants": {"id": "NYG", "name": "New York Giants", "league": "NFL", "aliases": ["Giants", "NYG"]},
            "jets": {"id": "NYJ", "name": "New York Jets", "league": "NFL", "aliases": ["Jets"]},
            "commanders": {"id": "WAS", "name": "Washington Commanders", "league": "NFL", "aliases": ["Commanders", "Washington"]},
            "panthers": {"id": "CAR", "name": "Carolina Panthers", "league": "NFL", "aliases": ["Panthers"]},
            "dolphins": {"id": "MIA", "name": "Miami Dolphins", "league": "NFL", "aliases": ["Dolphins"]},
            "titans": {"id": "TEN", "name": "Tennessee Titans", "league": "NFL", "aliases": ["Titans"]},
            
            # MLB Teams (All 30 teams)
            "yankees": {"id": "NYY", "name": "New York Yankees", "league": "MLB", "aliases": ["Yankees", "NYY"]},
            "dodgers": {"id": "LAD", "name": "Los Angeles Dodgers", "league": "MLB", "aliases": ["Dodgers", "LA Dodgers"]},
            "braves": {"id": "ATL", "name": "Atlanta Braves", "league": "MLB", "aliases": ["Braves"]},
            "redsox": {"id": "BOS", "name": "Boston Red Sox", "league": "MLB", "aliases": ["Red Sox", "Sox"]},
            "astros": {"id": "HOU", "name": "Houston Astros", "league": "MLB", "aliases": ["Astros"]},
            "cubs": {"id": "CHC", "name": "Chicago Cubs", "league": "MLB", "aliases": ["Cubs"]},
            "cardinals_mlb": {"id": "STL", "name": "St. Louis Cardinals", "league": "MLB", "aliases": ["Cardinals", "Cards", "St. Louis"]},
            "mets": {"id": "NYM", "name": "New York Mets", "league": "MLB", "aliases": ["Mets"]},
            "phillies": {"id": "PHI", "name": "Philadelphia Phillies", "league": "MLB", "aliases": ["Phillies", "Phils"]},
            "padres": {"id": "SD", "name": "San Diego Padres", "league": "MLB", "aliases": ["Padres"]},
            "giants_mlb": {"id": "SF", "name": "San Francisco Giants", "league": "MLB", "aliases": ["Giants", "SF Giants"]},
            "guardians": {"id": "CLE", "name": "Cleveland Guardians", "league": "MLB", "aliases": ["Guardians"]},
            "bluejays": {"id": "TOR", "name": "Toronto Blue Jays", "league": "MLB", "aliases": ["Blue Jays", "Jays"]},
            "mariners": {"id": "SEA", "name": "Seattle Mariners", "league": "MLB", "aliases": ["Mariners", "M's"]},
            "rangers": {"id": "TEX", "name": "Texas Rangers", "league": "MLB", "aliases": ["Rangers"]},
            "tigers": {"id": "DET", "name": "Detroit Tigers", "league": "MLB", "aliases": ["Tigers"]},
            "orioles": {"id": "BAL", "name": "Baltimore Orioles", "league": "MLB", "aliases": ["Orioles", "O's"]},
            "twins": {"id": "MIN", "name": "Minnesota Twins", "league": "MLB", "aliases": ["Twins"]},
            "angels": {"id": "LAA", "name": "Los Angeles Angels", "league": "MLB", "aliases": ["Angels", "LA Angels"]},
            "whitesox": {"id": "CWS", "name": "Chicago White Sox", "league": "MLB", "aliases": ["White Sox", "Sox"]},
            "brewers": {"id": "MIL", "name": "Milwaukee Brewers", "league": "MLB", "aliases": ["Brewers"]},
            "diamondbacks": {"id": "ARI", "name": "Arizona Diamondbacks", "league": "MLB", "aliases": ["D-backs", "Diamondbacks"]},
            "rays": {"id": "TB", "name": "Tampa Bay Rays", "league": "MLB", "aliases": ["Rays"]},
            "reds": {"id": "CIN", "name": "Cincinnati Reds", "league": "MLB", "aliases": ["Reds"]},
            "marlins": {"id": "MIA", "name": "Miami Marlins", "league": "MLB", "aliases": ["Marlins"]},
            "rockies": {"id": "COL", "name": "Colorado Rockies", "league": "MLB", "aliases": ["Rockies"]},
            "athletics": {"id": "OAK", "name": "Oakland Athletics", "league": "MLB", "aliases": ["A's", "Athletics"]},
            "nationals": {"id": "WSH", "name": "Washington Nationals", "league": "MLB", "aliases": ["Nationals", "Nats"]},
            "royals": {"id": "KC", "name": "Kansas City Royals", "league": "MLB", "aliases": ["Royals"]},
            "pirates": {"id": "PIT", "name": "Pittsburgh Pirates", "league": "MLB", "aliases": ["Pirates", "Bucs"]},
            
            # NHL Teams (All 32 teams)
            "maple_leafs": {"id": "TOR", "name": "Toronto Maple Leafs", "league": "NHL", "aliases": ["Maple Leafs", "Leafs"]},
            "canadiens": {"id": "MTL", "name": "Montreal Canadiens", "league": "NHL", "aliases": ["Canadiens", "Habs"]},
            "bruins": {"id": "BOS", "name": "Boston Bruins", "league": "NHL", "aliases": ["Bruins"]},
            "rangers": {"id": "NYR", "name": "New York Rangers", "league": "NHL", "aliases": ["Rangers"]},
            "blackhawks": {"id": "CHI", "name": "Chicago Blackhawks", "league": "NHL", "aliases": ["Blackhawks", "Hawks"]},
            "oilers": {"id": "EDM", "name": "Edmonton Oilers", "league": "NHL", "aliases": ["Oilers"]},
            "penguins": {"id": "PIT", "name": "Pittsburgh Penguins", "league": "NHL", "aliases": ["Penguins", "Pens"]},
            "lightning": {"id": "TB", "name": "Tampa Bay Lightning", "league": "NHL", "aliases": ["Lightning", "Bolts"]},
            "avalanche": {"id": "COL", "name": "Colorado Avalanche", "league": "NHL", "aliases": ["Avalanche", "Avs"]},
            "flames": {"id": "CGY", "name": "Calgary Flames", "league": "NHL", "aliases": ["Flames"]},
            "capitals": {"id": "WSH", "name": "Washington Capitals", "league": "NHL", "aliases": ["Capitals", "Caps"]},
            "redwings": {"id": "DET", "name": "Detroit Red Wings", "league": "NHL", "aliases": ["Red Wings", "Wings"]},
            "golden_knights": {"id": "VGK", "name": "Vegas Golden Knights", "league": "NHL", "aliases": ["Golden Knights", "Knights", "Vegas"]},
            "flyers": {"id": "PHI", "name": "Philadelphia Flyers", "league": "NHL", "aliases": ["Flyers"]},
            "stars": {"id": "DAL", "name": "Dallas Stars", "league": "NHL", "aliases": ["Stars"]},
            "canucks": {"id": "VAN", "name": "Vancouver Canucks", "league": "NHL", "aliases": ["Canucks"]},
            "predators": {"id": "NSH", "name": "Nashville Predators", "league": "NHL", "aliases": ["Predators", "Preds"]},
            "devils": {"id": "NJ", "name": "New Jersey Devils", "league": "NHL", "aliases": ["Devils"]},
            "blues": {"id": "STL", "name": "St. Louis Blues", "league": "NHL", "aliases": ["Blues"]},
            "islanders": {"id": "NYI", "name": "New York Islanders", "league": "NHL", "aliases": ["Islanders", "Isles"]},
            "wild": {"id": "MIN", "name": "Minnesota Wild", "league": "NHL", "aliases": ["Wild"]},
            "kings": {"id": "LAK", "name": "Los Angeles Kings", "league": "NHL", "aliases": ["Kings", "LA Kings"]},
            "hurricanes": {"id": "CAR", "name": "Carolina Hurricanes", "league": "NHL", "aliases": ["Hurricanes", "Canes"]},
            "panthers_nhl": {"id": "FLA", "name": "Florida Panthers", "league": "NHL", "aliases": ["Panthers"]},
            "jets": {"id": "WPG", "name": "Winnipeg Jets", "league": "NHL", "aliases": ["Jets"]},
            "blue_jackets": {"id": "CBJ", "name": "Columbus Blue Jackets", "league": "NHL", "aliases": ["Blue Jackets", "CBJ"]},
            "senators": {"id": "OTT", "name": "Ottawa Senators", "league": "NHL", "aliases": ["Senators", "Sens"]},
            "sabres": {"id": "BUF", "name": "Buffalo Sabres", "league": "NHL", "aliases": ["Sabres"]},
            "ducks": {"id": "ANA", "name": "Anaheim Ducks", "league": "NHL", "aliases": ["Ducks"]},
            "sharks": {"id": "SJ", "name": "San Jose Sharks", "league": "NHL", "aliases": ["Sharks"]},
            "coyotes": {"id": "ARI", "name": "Arizona Coyotes", "league": "NHL", "aliases": ["Coyotes", "Yotes"]},
            "kraken": {"id": "SEA", "name": "Seattle Kraken", "league": "NHL", "aliases": ["Kraken"]},
            
            # EPL Teams (All 20 teams)
            "arsenal": {"id": "ARS", "name": "Arsenal", "league": "EPL", "aliases": ["Gunners", "The Arsenal"]},
            "liverpool": {"id": "LIV", "name": "Liverpool", "league": "EPL", "aliases": ["Reds", "LFC"]},
            "mancity": {"id": "MCI", "name": "Manchester City", "league": "EPL", "aliases": ["Man City", "City", "Citizens"]},
            "manutd": {"id": "MUN", "name": "Manchester United", "league": "EPL", "aliases": ["Man Utd", "United", "Red Devils"]},
            "chelsea": {"id": "CHE", "name": "Chelsea", "league": "EPL", "aliases": ["Blues", "The Blues", "CFC"]},
            "tottenham": {"id": "TOT", "name": "Tottenham Hotspur", "league": "EPL", "aliases": ["Spurs", "Tottenham"]},
            "newcastle": {"id": "NEW", "name": "Newcastle United", "league": "EPL", "aliases": ["Newcastle", "Magpies", "Toon"]},
            "astonvilla": {"id": "AVL", "name": "Aston Villa", "league": "EPL", "aliases": ["Villa"]},
            "westham": {"id": "WHU", "name": "West Ham United", "league": "EPL", "aliases": ["West Ham", "Hammers"]},
            "everton": {"id": "EVE", "name": "Everton", "league": "EPL", "aliases": ["Toffees"]},
            "brighton": {"id": "BHA", "name": "Brighton & Hove Albion", "league": "EPL", "aliases": ["Brighton", "Seagulls"]},
            "crystalpalace": {"id": "CRY", "name": "Crystal Palace", "league": "EPL", "aliases": ["Palace", "Eagles"]},
            "wolves": {"id": "WOL", "name": "Wolverhampton Wanderers", "league": "EPL", "aliases": ["Wolves"]},
            "leicester": {"id": "LEI", "name": "Leicester City", "league": "EPL", "aliases": ["Leicester", "Foxes"]},
            "brentford": {"id": "BRE", "name": "Brentford", "league": "EPL", "aliases": ["Bees"]},
            "fulham": {"id": "FUL", "name": "Fulham", "league": "EPL", "aliases": ["Cottagers"]},
            "bournemouth": {"id": "BOU", "name": "AFC Bournemouth", "league": "EPL", "aliases": ["Bournemouth", "Cherries"]},
            "southampton": {"id": "SOU", "name": "Southampton", "league": "EPL", "aliases": ["Saints"]},
            "nottinghamforest": {"id": "NFO", "name": "Nottingham Forest", "league": "EPL", "aliases": ["Forest"]},
            "ipswich": {"id": "IPS", "name": "Ipswich Town", "league": "EPL", "aliases": ["Ipswich", "Tractor Boys"]},
            
            # La Liga Teams (All 20 teams)
            "barcelona": {"id": "FCB", "name": "FC Barcelona", "league": "LALIGA", "aliases": ["Barça", "Barcelona", "Blaugrana"]},
            "realmadrid": {"id": "RMA", "name": "Real Madrid", "league": "LALIGA", "aliases": ["Madrid", "Los Blancos", "Los Merengues"]},
            "atletico": {"id": "ATM", "name": "Atletico Madrid", "league": "LALIGA", "aliases": ["Atleti", "Atletico", "Colchoneros"]},
            "sevilla": {"id": "SEV", "name": "Sevilla FC", "league": "LALIGA", "aliases": ["Sevilla"]},
            "valencia": {"id": "VAL", "name": "Valencia CF", "league": "LALIGA", "aliases": ["Valencia", "Los Che"]},
            "villarreal": {"id": "VIL", "name": "Villarreal CF", "league": "LALIGA", "aliases": ["Villarreal", "Yellow Submarine"]},
            "athleticbilbao": {"id": "ATH", "name": "Athletic Bilbao", "league": "LALIGA", "aliases": ["Athletic", "Athletic Club", "Bilbao"]},
            "realsociedad": {"id": "RSO", "name": "Real Sociedad", "league": "LALIGA", "aliases": ["La Real", "Sociedad"]},
            "betis": {"id": "BET", "name": "Real Betis", "league": "LALIGA", "aliases": ["Betis", "Los Verdiblancos"]},
            "getafe": {"id": "GET", "name": "Getafe CF", "league": "LALIGA", "aliases": ["Getafe", "Azulones"]},
            "osasuna": {"id": "OSA", "name": "CA Osasuna", "league": "LALIGA", "aliases": ["Osasuna", "Los Rojillos"]},
            "espanyol": {"id": "ESP", "name": "RCD Espanyol", "league": "LALIGA", "aliases": ["Espanyol", "Pericos"]},
            "celtavigo": {"id": "CEL", "name": "Celta Vigo", "league": "LALIGA", "aliases": ["Celta", "Célticos"]},
            "rayo": {"id": "RAY", "name": "Rayo Vallecano", "league": "LALIGA", "aliases": ["Rayo", "Los Franjirrojos"]},
            "mallorca": {"id": "MAL", "name": "RCD Mallorca", "league": "LALIGA", "aliases": ["Mallorca", "Los Bermellones"]},
            "revalladolid": {"id": "VLL", "name": "Real Valladolid", "league": "LALIGA", "aliases": ["Valladolid", "Pucela"]},
            "cadiz": {"id": "CAD", "name": "Cádiz CF", "league": "LALIGA", "aliases": ["Cádiz", "Submarino Amarillo"]},
            "alaves": {"id": "ALA", "name": "Deportivo Alavés", "league": "LALIGA", "aliases": ["Alavés", "Babazorros"]},
            "girona": {"id": "GIR", "name": "Girona FC", "league": "LALIGA", "aliases": ["Girona"]},
            "laspalmas": {"id": "LPA", "name": "UD Las Palmas", "league": "LALIGA", "aliases": ["Las Palmas"]},
            
            # Serie A Teams (All 20 teams)
            "juventus": {"id": "JUV", "name": "Juventus", "league": "SERIEA", "aliases": ["Juve", "Old Lady", "Bianconeri"]},
            "intermilan": {"id": "INT", "name": "Inter Milan", "league": "SERIEA", "aliases": ["Inter", "Nerazzurri"]},
            "acmilan": {"id": "MIL", "name": "AC Milan", "league": "SERIEA", "aliases": ["Milan", "Rossoneri"]},
            "roma": {"id": "ROM", "name": "AS Roma", "league": "SERIEA", "aliases": ["Roma", "Giallorossi"]},
            "napoli": {"id": "NAP", "name": "Napoli", "league": "SERIEA", "aliases": ["Azzurri", "Partenopei"]},
            "lazio": {"id": "LAZ", "name": "Lazio", "league": "SERIEA", "aliases": ["Biancocelesti"]},
            "atalanta": {"id": "ATA", "name": "Atalanta", "league": "SERIEA", "aliases": ["La Dea", "Nerazzurri"]},
            "fiorentina": {"id": "FIO", "name": "Fiorentina", "league": "SERIEA", "aliases": ["Viola", "La Viola"]},
            "bologna": {"id": "BOL", "name": "Bologna", "league": "SERIEA", "aliases": ["Rossoblù"]},
            "torino": {"id": "TOR", "name": "Torino", "league": "SERIEA", "aliases": ["Toro", "Granata"]},
            "udinese": {"id": "UDI", "name": "Udinese", "league": "SERIEA", "aliases": ["Zebrette", "Bianconeri"]},
            "sassuolo": {"id": "SAS", "name": "Sassuolo", "league": "SERIEA", "aliases": ["Neroverdi"]},
            "sampdoria": {"id": "SAM", "name": "Sampdoria", "league": "SERIEA", "aliases": ["Samp", "Blucerchiati"]},
            "cagliari": {"id": "CAG", "name": "Cagliari", "league": "SERIEA", "aliases": ["Isolani", "Rossoblu"]},
            "verona": {"id": "VER", "name": "Hellas Verona", "league": "SERIEA", "aliases": ["Verona", "Gialloblu"]},
            "genoa": {"id": "GEN", "name": "Genoa", "league": "SERIEA", "aliases": ["Grifone", "Rossoblu"]},
            "parma": {"id": "PAR", "name": "Parma", "league": "SERIEA", "aliases": ["Crociati", "Ducali"]},
            "empoli": {"id": "EMP", "name": "Empoli", "league": "SERIEA", "aliases": ["Azzurri"]},
            "monza": {"id": "MON", "name": "Monza", "league": "SERIEA", "aliases": ["Biancorossi"]},
            "lecce": {"id": "LEC", "name": "Lecce", "league": "SERIEA", "aliases": ["Giallorossi", "Salentini"]},
            
            # Bundesliga Teams (All 18 teams)
            "bayern": {"id": "BAY", "name": "Bayern Munich", "league": "BL", "aliases": ["Bayern", "FC Bayern", "Die Roten"]},
            "dortmund": {"id": "BVB", "name": "Borussia Dortmund", "league": "BL", "aliases": ["BVB", "Die Schwarzgelben"]},
            "leipzig": {"id": "RBL", "name": "RB Leipzig", "league": "BL", "aliases": ["Leipzig", "Die Roten Bullen"]},
            "leverkusen": {"id": "B04", "name": "Bayer Leverkusen", "league": "BL", "aliases": ["Leverkusen", "Die Werkself"]},
            "gladbach": {"id": "BMG", "name": "Borussia Mönchengladbach", "league": "BL", "aliases": ["Gladbach", "Die Fohlen"]},
            "wolfsburg": {"id": "WOB", "name": "VfL Wolfsburg", "league": "BL", "aliases": ["Wolfsburg", "Die Wölfe"]},
            "frankfurt": {"id": "SGE", "name": "Eintracht Frankfurt", "league": "BL", "aliases": ["Frankfurt", "Die Adler"]},
            "hoffenheim": {"id": "TSG", "name": "TSG Hoffenheim", "league": "BL", "aliases": ["Hoffenheim", "Die Kraichgauer"]},
            "stuttgart": {"id": "VFB", "name": "VfB Stuttgart", "league": "BL", "aliases": ["Stuttgart", "Die Schwaben"]},
            "union": {"id": "FCU", "name": "Union Berlin", "league": "BL", "aliases": ["Union", "Die Eisernen"]},
            "mainz": {"id": "M05", "name": "Mainz 05", "league": "BL", "aliases": ["Mainz", "Die Nullfünfer"]},
            "freiburg": {"id": "SCF", "name": "SC Freiburg", "league": "BL", "aliases": ["Freiburg", "Breisgau-Brasilianer"]},
            "cologne": {"id": "KOE", "name": "FC Cologne", "league": "BL", "aliases": ["Köln", "FC Köln", "Die Geißböcke"]},
            "werder": {"id": "SVW", "name": "Werder Bremen", "league": "BL", "aliases": ["Bremen", "Die Werderaner"]},
            "augsburg": {"id": "AUG", "name": "FC Augsburg", "league": "BL", "aliases": ["Augsburg", "FCA"]},
            "hertha": {"id": "BSC", "name": "Hertha Berlin", "league": "BL", "aliases": ["Hertha", "Die Alte Dame"]},
            "bochum": {"id": "BOC", "name": "VfL Bochum", "league": "BL", "aliases": ["Bochum", "Die Unabsteigbaren"]},
            "kiel": {"id": "KIE", "name": "Holstein Kiel", "league": "BL", "aliases": ["Kiel", "Die Störche"]}
        }
    
    def find_entity(self, text, entity_type=None, threshold=0.75):
        """Find an entity in the text using fuzzy matching
        
        Args:
            text: The text to search for entities
            entity_type: Optional type of entity to search for (player, team, etc.)
            threshold: Minimum similarity threshold for a match
            
        Returns:
            Tuple of (entity_id, entity_name, entity_type, similarity_score)
        """
        text = text.lower()
        best_match = None
        best_score = 0
        best_type = None
        
        # Get entities based on type
        if entity_type == "player":
            entities = self.players
        elif entity_type == "team":
            entities = self.teams
        else:
            # Search all entities
            entities = {**self.teams, **self.players}
        
        # Search for the best match
        for entity_id, entity_data in entities.items():
            # Try exact match on name first
            if text == entity_data["name"].lower():
                return (entity_id, entity_data["name"], entity_type or "team" if entity_id in self.teams else "player", 1.0)
            
            # Check against name
            name_sim = self._similarity(text, entity_data["name"].lower())
            if name_sim > best_score:
                best_score = name_sim
                best_match = (entity_id, entity_data["name"])
                best_type = entity_type or "team" if entity_id in self.teams else "player"
            
            # Check against aliases
            for alias in entity_data.get("aliases", []):
                alias_sim = self._similarity(text, alias.lower())
                if alias_sim > best_score:
                    best_score = alias_sim
                    best_match = (entity_id, entity_data["name"])
                    best_type = entity_type or "team" if entity_id in self.teams else "player"
        
        if best_score >= threshold:
            return (best_match[0], best_match[1], best_type, best_score)
        
        return (None, None, None, 0)
        
    def _similarity(self, s1, s2):
        """Calculate string similarity between 0 and 1"""
        if not s1 or not s2:
            return 0
        
        # Try exact match first
        if s1 == s2:
            return 1.0
            
        # Use Levenshtein distance for fuzzy matching
        distance = self._levenshtein_distance(s1, s2)
        max_len = max(len(s1), len(s2))
        if max_len == 0:
            return 0
        
        return 1 - (distance / max_len)


class AdvancedNegationDetector:
    """Advanced negation detection for sports predictions"""
    
    def __init__(self, nlp=None, transformer_model=None):
        """Initialize the negation detector
        
        Args:
            nlp: Optional spaCy NLP model
            transformer_model: Optional transformer-based model
        """
        self.nlp = nlp
        self.transformer_model = transformer_model
        
        # Common negation patterns in sports contexts
        self.negation_terms = [
            "not", "n't", "don't", "doesn't", "won't", "isn't", "aren't", "didn't",
            "no", "never", "nobody", "none", "nothing", "nowhere", "neither", "nor",
            "fails to", "unable to", "can't", "cannot", "couldn't", "shouldn't", 
            "without", "unlikely", "prevent", "stops", "lack", "lacks", "fails", 
            "miss", "misses", "avoided", "avoids", "denied", "denies"
        ]
        
        # Scope modifiers that can change negation scope
        self.scope_modifiers = [
            "but", "however", "although", "though", "except", "despite", 
            "in spite of", "nonetheless", "nevertheless", "regardless", 
            "notwithstanding", "yet", "still", "even so", "all the same"
        ]
    
    def detect_negation(self, text: str) -> dict:
        """Detect negation in text with scope analysis
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with negation information
        """
        # Use transformer model if available (most accurate)
        if self.transformer_model:
            return self._detect_with_transformer(text)
        
        # Use spaCy if available
        if self.nlp:
            return self._detect_with_spacy(text)
        
        # Fallback to pattern matching
        return self._detect_with_patterns(text)
    
    def _detect_with_transformer(self, text: str) -> dict:
        """Detect negation using transformer-based model
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with negation information
        """
        try:
            result = self.transformer_model(text)
            
            is_negated = False
            confidence = 0.5
            
            # Parse model output
            if hasattr(result, '__getitem__') and len(result) > 0:
                label = result[0].get('label', '')
                score = result[0].get('score', 0.5)
                
                is_negated = label == 'NEG' or 'negation' in label.lower()
                confidence = score
            
            return {
                "is_negated": is_negated,
                "confidence": confidence,
                "scope": text,  # Full text as scope with transformer model
                "method": "transformer"
            }
        
        except Exception as e:
            logger.error(f"Error in transformer-based negation detection: {str(e)}")
            # Fallback to pattern matching
            return self._detect_with_patterns(text)
    
    def _detect_with_spacy(self, text: str) -> dict:
        """Detect negation using spaCy dependency parsing
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with negation information
        """
        doc = self.nlp(text)
        
        # Check for negation markers
        negation_tokens = []
        for token in doc:
            # Check for direct negation
            if (token.dep_ == "neg" or 
                token.lower_ in self.negation_terms or 
                token.lemma_ in self.negation_terms):
                negation_tokens.append(token)
        
        if not negation_tokens:
            return {
                "is_negated": False,
                "confidence": 0.9,
                "scope": None,
                "method": "spacy"
            }
        
        # Determine negation scope
        scopes = []
        for neg_token in negation_tokens:
            # Find the scope of negation (usually the parent of negation token and its subtree)
            if neg_token.dep_ == "neg":
                # Direct negation
                head = neg_token.head
                scope_start = min(token.i for token in head.subtree)
                scope_end = max(token.i for token in head.subtree)
                
                # Create scope text
                scope_text = doc[scope_start:scope_end+1].text
                scopes.append(scope_text)
            else:
                # Negation word not marked as "neg" dependency
                # Take a window of tokens before and after
                window_size = 5
                start = max(0, neg_token.i - window_size)
                end = min(len(doc), neg_token.i + window_size + 1)
                scope_text = doc[start:end].text
                scopes.append(scope_text)
        
        # Check for scope modifiers that might restrict negation
        has_scope_modifier = any(modifier in text.lower() for modifier in self.scope_modifiers)
        
        # Determine confidence based on analysis
        if has_scope_modifier:
            confidence = 0.7  # Lower confidence if scope modifiers are present
        else:
            confidence = 0.9  # Higher confidence for clear negation
        
        return {
            "is_negated": True,
            "confidence": confidence,
            "scope": scopes,
            "has_scope_modifier": has_scope_modifier,
            "method": "spacy"
        }
    
    def _detect_with_patterns(self, text: str) -> dict:
        """Detect negation using pattern matching
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with negation information
        """
        text_lower = text.lower()
        
        # Check for negation words
        has_negation = any(neg_term in text_lower.split() or 
                           f" {neg_term} " in f" {text_lower} " or
                           f" {neg_term}." in f" {text_lower} " or
                           f" {neg_term}," in f" {text_lower} "
                           for neg_term in self.negation_terms)
        
        if not has_negation:
            return {
                "is_negated": False,
                "confidence": 0.7,  # Lower confidence with pattern matching
                "scope": None,
                "method": "pattern"
            }
        
        # Simple scope identification - find sentences containing negation terms
        import nltk
        try:
            sentences = nltk.sent_tokenize(text)
            negated_sentences = [
                sentence for sentence in sentences
                if any(neg_term in sentence.lower() for neg_term in self.negation_terms)
            ]
            
            # Check for scope modifiers
            has_scope_modifier = any(modifier in text_lower for modifier in self.scope_modifiers)
            
            # Lower confidence with pattern matching
            confidence = 0.6 if has_scope_modifier else 0.7
            
            return {
                "is_negated": True,
                "confidence": confidence,
                "scope": negated_sentences,
                "has_scope_modifier": has_scope_modifier,
                "method": "pattern"
            }
        except:
            # Ultra-simple fallback
            return {
                "is_negated": True,
                "confidence": 0.6,
                "scope": text,
                "method": "simple_pattern"
            }


class AdvancedTimeFrameDetector:
    """Advanced time frame detection for sports predictions"""
    
    def __init__(self, nlp=None):
        """Initialize the time frame detector
        
        Args:
            nlp: Optional spaCy NLP model
        """
        self.nlp = nlp
        
        # Standard time frames in sports
        self.time_frames = {
            "game": ["game", "match", "contest", "fixture", "matchup", "meeting", "faceoff", "showdown", "bout"],
            "half": ["half", "halftime", "half-time", "half time", "1st half", "2nd half", "first half", "second half", "halves"],
            "quarter": ["quarter", "1st quarter", "2nd quarter", "3rd quarter", "4th quarter", "first quarter", "second quarter", "third quarter", "fourth quarter", "q1", "q2", "q3", "q4"],
            "period": ["period", "1st period", "2nd period", "3rd period", "first period", "second period", "third period", "p1", "p2", "p3"],
            "inning": ["inning", "innings", "1st inning", "2nd inning", "top of the inning", "bottom of the inning", "frame"],
            "season": ["season", "year", "regular season", "campaign", "this season", "current season", "last season", "prior season", "off-season", "preseason"],
            "month": ["month", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
            "week": ["week", "gameweek", "match week", "matchweek", "week 1", "week 2", "week 3", "week 4", "week 5", "week 6", "week 7"],
            "tournament": ["tournament", "competition", "cup", "championship", "series", "playoffs", "finals", "semi-finals", "quarterfinals", "group stage", "knockout stage"],
            "overtime": ["overtime", "ot", "extra time", "et", "supplementary time", "added time", "injury time", "stoppage time", "additional time"],
            "shootout": ["shootout", "penalty shootout", "penalties", "penalty kicks"],
            "specific": ["minute", "minutes", "min", "mins", "second", "seconds", "sec", "secs"],
            "career": ["career", "lifetime", "entire career", "all-time", "career total", "career stats", "legacy"],
            "stretch": ["stretch", "run", "streak", "span", "recent games", "last few games", "upcoming games", "next few games", "road trip", "home stand", "winning streak", "losing streak"]
        }
        
        # Time positions (modifiers)
        self.time_positions = {
            "first": ["first", "1st", "opening", "start", "early", "beginning", "initial", "earliest", "starting"],
            "second": ["second", "2nd", "mid", "middle", "halfway", "midway"],
            "third": ["third", "3rd"],
            "fourth": ["fourth", "4th"],
            "fifth": ["fifth", "5th"],
            "sixth": ["sixth", "6th"],
            "seventh": ["seventh", "7th"],
            "eighth": ["eighth", "8th"],
            "ninth": ["ninth", "9th"],
            "last": ["last", "final", "ending", "close", "late", "closing", "finish", "concluding", "latter"],
            "entire": ["entire", "whole", "full", "complete", "all", "throughout", "overall", "total"],
            "current": ["current", "ongoing", "present", "this", "active", "existing", "now"],
            "upcoming": ["upcoming", "next", "future", "coming", "approaching", "forthcoming", "imminent"],
            "past": ["past", "previous", "recent", "earlier", "prior", "former", "preceding", "finished"]
        }
        
        # Time quantifiers
        self.time_quantifiers = {
            "single": ["a", "one", "single", "individual", "specific", "particular"],
            "couple": ["couple", "two", "pair", "duo"],
            "few": ["few", "several", "some", "handful"],
            "many": ["many", "multiple", "numerous", "various", "lot", "lots"],
            "all": ["all", "every", "each", "any"],
            "most": ["most", "majority", "bulk", "greater part"],
            "exact": list(map(str, range(1, 21)))  # Numbers 1-20 as strings
        }
    
    def detect_time_frame(self, text: str) -> dict:
        """Detect time frames in text
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with time frame information
        """
        # Use spaCy for advanced detection if available
        if self.nlp:
            return self._detect_with_spacy(text)
        
        # Fallback to pattern matching
        return self._detect_with_patterns(text)
    
    def _detect_with_spacy(self, text: str) -> dict:
        """Detect time frames using spaCy NLP
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with time frame information
        """
        doc = self.nlp(text)
        
        # Initialize results
        result = {
            "primary_frame": None,
            "position": None,
            "quantifier": None,
            "specific_value": None,
            "temporal_phrases": [],
            "confidence": 0.5
        }
        
        # Identify time-related entities
        for ent in doc.ents:
            if ent.label_ in ["DATE", "TIME"]:
                result["temporal_phrases"].append(ent.text)
        
        # Look for time frame terms
        time_frames_found = {}
        for frame_type, patterns in self.time_frames.items():
            for pattern in patterns:
                if pattern in text.lower():
                    if frame_type not in time_frames_found:
                        time_frames_found[frame_type] = []
                    time_frames_found[frame_type].append(pattern)
        
        # Look for position modifiers
        positions_found = {}
        for position_type, patterns in self.time_positions.items():
            for pattern in patterns:
                if pattern in text.lower():
                    if position_type not in positions_found:
                        positions_found[position_type] = []
                    positions_found[position_type].append(pattern)
        
        # Look for quantifiers
        quantifiers_found = {}
        for quantifier_type, patterns in self.time_quantifiers.items():
            for pattern in patterns:
                if pattern in text.lower().split() or f" {pattern} " in f" {text.lower()} ":
                    if quantifier_type not in quantifiers_found:
                        quantifiers_found[quantifier_type] = []
                    quantifiers_found[quantifier_type].append(pattern)
        
        # Extract specific numeric values related to time
        specific_values = []
        for token in doc:
            if token.like_num:
                # Check if adjacent tokens include time units
                time_units = ["minute", "minutes", "min", "mins", "second", "seconds", "sec", "secs", 
                             "game", "games", "match", "matches", "quarter", "quarters", "half", "halves", 
                             "period", "periods", "inning", "innings", "season", "seasons", "week", "weeks"]
                
                # Check next 2 tokens
                next_tokens = [doc[i].text.lower() for i in range(token.i + 1, min(token.i + 3, len(doc)))]
                
                # Check if any time unit appears in next tokens
                if any(unit in next_tokens for unit in time_units):
                    specific_values.append((token.text, "".join(next_tokens[:2])))
        
        # Set the primary time frame (prioritizing more specific frames)
        if time_frames_found:
            # Priority order for time frames
            priority_order = ["specific", "minute", "quarter", "half", "period", "inning", 
                             "overtime", "shootout", "game", "week", "month", "season", 
                             "tournament", "career", "stretch"]
            
            # Find the highest priority time frame
            for frame in priority_order:
                if frame in time_frames_found:
                    result["primary_frame"] = frame
                    break
            
            # If no priority frame found, use the first one
            if not result["primary_frame"] and time_frames_found:
                result["primary_frame"] = list(time_frames_found.keys())[0]
        
        # Set the position modifier
        if positions_found:
            # Use the first position found
            result["position"] = list(positions_found.keys())[0]
        
        # Set the quantifier
        if quantifiers_found:
            # Use the first quantifier found
            result["quantifier"] = list(quantifiers_found.keys())[0]
        
        # Set specific numeric values
        if specific_values:
            result["specific_value"] = specific_values[0]
        
        # Calculate confidence based on the quality of detection
        confidence = 0.5  # Base confidence
        
        if result["primary_frame"]:
            confidence += 0.2
        
        if result["position"]:
            confidence += 0.1
        
        if result["specific_value"]:
            confidence += 0.2
        
        if len(result["temporal_phrases"]) > 0:
            confidence += 0.1
        
        # Cap confidence at 0.95
        result["confidence"] = min(confidence, 0.95)
        
        return result
    
    def _detect_with_patterns(self, text: str) -> dict:
        """Detect time frames using pattern matching
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary with time frame information
        """
        text_lower = text.lower()
        
        # Initialize results
        result = {
            "primary_frame": None,
            "position": None,
            "quantifier": None,
            "specific_value": None,
            "confidence": 0.5
        }
        
        # Look for time frame terms
        time_frames_found = {}
        for frame_type, patterns in self.time_frames.items():
            for pattern in patterns:
                if pattern in text_lower:
                    if frame_type not in time_frames_found:
                        time_frames_found[frame_type] = []
                    time_frames_found[frame_type].append(pattern)
        
        # Look for position modifiers
        positions_found = {}
        for position_type, patterns in self.time_positions.items():
            for pattern in patterns:
                if pattern in text_lower:
                    if position_type not in positions_found:
                        positions_found[position_type] = []
                    positions_found[position_type].append(pattern)
        
        # Look for quantifiers
        quantifiers_found = {}
        for quantifier_type, patterns in self.time_quantifiers.items():
            for pattern in patterns:
                if pattern in text_lower.split() or f" {pattern} " in f" {text_lower} ":
                    if quantifier_type not in quantifiers_found:
                        quantifiers_found[quantifier_type] = []
                    quantifiers_found[quantifier_type].append(pattern)
        
        # Extract specific numeric values related to time with simple regex
        specific_values = []
        numeric_pattern = r'(\d+)\s+(minute|minutes|min|mins|second|seconds|sec|secs|game|games|match|matches|quarter|quarters|half|halves|period|periods|inning|innings|season|seasons|week|weeks)'
        matches = re.findall(numeric_pattern, text_lower)
        if matches:
            specific_values = matches
        
        # Set the primary time frame (prioritizing more specific frames)
        if time_frames_found:
            # Priority order for time frames (same as in spaCy method)
            priority_order = ["specific", "minute", "quarter", "half", "period", "inning", 
                             "overtime", "shootout", "game", "week", "month", "season", 
                             "tournament", "career", "stretch"]
            
            # Find the highest priority time frame
            for frame in priority_order:
                if frame in time_frames_found:
                    result["primary_frame"] = frame
                    break
            
            # If no priority frame found, use the first one
            if not result["primary_frame"] and time_frames_found:
                result["primary_frame"] = list(time_frames_found.keys())[0]
        
        # Set the position modifier
        if positions_found:
            result["position"] = list(positions_found.keys())[0]
        
        # Set the quantifier
        if quantifiers_found:
            result["quantifier"] = list(quantifiers_found.keys())[0]
        
        # Set specific numeric values
        if specific_values:
            result["specific_value"] = specific_values[0]
        
        # Calculate confidence (lower than spaCy method)
        confidence = 0.4  # Lower base confidence
        
        if result["primary_frame"]:
            confidence += 0.2
        
        if result["position"]:
            confidence += 0.1
        
        if result["specific_value"]:
            confidence += 0.2
        
        # Cap confidence at 0.85 (lower than spaCy)
        result["confidence"] = min(confidence, 0.85)
        
        return result
    
    def _get_default_teams(self):
        """Get comprehensive teams data for all 8 primary leagues"""
        return {
            # NBA Teams (All 30 teams)
            "lakers": {"id": "LAL", "name": "Los Angeles Lakers", "league": "NBA", "aliases": ["Lakers", "LA Lakers"]},
            "celtics": {"id": "BOS", "name": "Boston Celtics", "league": "NBA", "aliases": ["Celtics"]},
            "warriors": {"id": "GSW", "name": "Golden State Warriors", "league": "NBA", "aliases": ["Warriors", "GSW", "Golden State", "Dubs"]},
            "bucks": {"id": "MIL", "name": "Milwaukee Bucks", "league": "NBA", "aliases": ["Bucks"]},
            "nuggets": {"id": "DEN", "name": "Denver Nuggets", "league": "NBA", "aliases": ["Nuggets"]},
            "heat": {"id": "MIA", "name": "Miami Heat", "league": "NBA", "aliases": ["Heat"]},
            "suns": {"id": "PHX", "name": "Phoenix Suns", "league": "NBA", "aliases": ["Suns"]},
            "mavs": {"id": "DAL", "name": "Dallas Mavericks", "league": "NBA", "aliases": ["Mavs", "Mavericks"]},
            "knicks": {"id": "NYK", "name": "New York Knicks", "league": "NBA", "aliases": ["Knicks"]},
            "sixers": {"id": "PHI", "name": "Philadelphia 76ers", "league": "NBA", "aliases": ["76ers", "Sixers"]},
            "cavaliers": {"id": "CLE", "name": "Cleveland Cavaliers", "league": "NBA", "aliases": ["Cavs", "Cavaliers"]},
            "thunder": {"id": "OKC", "name": "Oklahoma City Thunder", "league": "NBA", "aliases": ["Thunder", "OKC"]},
            "clippers": {"id": "LAC", "name": "Los Angeles Clippers", "league": "NBA", "aliases": ["Clippers", "LA Clippers"]},
            "timberwolves": {"id": "MIN", "name": "Minnesota Timberwolves", "league": "NBA", "aliases": ["Wolves", "T-Wolves", "Timberwolves"]},
            "pelicans": {"id": "NOP", "name": "New Orleans Pelicans", "league": "NBA", "aliases": ["Pelicans", "Pels"]},
            "kings": {"id": "SAC", "name": "Sacramento Kings", "league": "NBA", "aliases": ["Kings"]},
            "rockets": {"id": "HOU", "name": "Houston Rockets", "league": "NBA", "aliases": ["Rockets"]},
            "magic": {"id": "ORL", "name": "Orlando Magic", "league": "NBA", "aliases": ["Magic"]},
            "pacers": {"id": "IND", "name": "Indiana Pacers", "league": "NBA", "aliases": ["Pacers"]},
            "nets": {"id": "BKN", "name": "Brooklyn Nets", "league": "NBA", "aliases": ["Nets"]},
            "raptors": {"id": "TOR", "name": "Toronto Raptors", "league": "NBA", "aliases": ["Raptors"]},
            "bulls": {"id": "CHI", "name": "Chicago Bulls", "league": "NBA", "aliases": ["Bulls"]},
            "hawks": {"id": "ATL", "name": "Atlanta Hawks", "league": "NBA", "aliases": ["Hawks"]},
            "wizards": {"id": "WAS", "name": "Washington Wizards", "league": "NBA", "aliases": ["Wizards"]},
            "grizzlies": {"id": "MEM", "name": "Memphis Grizzlies", "league": "NBA", "aliases": ["Grizzlies", "Grizz"]},
            "spurs": {"id": "SAS", "name": "San Antonio Spurs", "league": "NBA", "aliases": ["Spurs"]},
            "hornets": {"id": "CHA", "name": "Charlotte Hornets", "league": "NBA", "aliases": ["Hornets"]},
            "jazz": {"id": "UTA", "name": "Utah Jazz", "league": "NBA", "aliases": ["Jazz"]},
            "trailblazers": {"id": "POR", "name": "Portland Trail Blazers", "league": "NBA", "aliases": ["Blazers", "Trail Blazers"]},
            "pistons": {"id": "DET", "name": "Detroit Pistons", "league": "NBA", "aliases": ["Pistons"]},
            
            # NFL Teams (All 32 teams)
            "chiefs": {"id": "KC", "name": "Kansas City Chiefs", "league": "NFL", "aliases": ["Chiefs", "KC Chiefs"]},
            "eagles": {"id": "PHI", "name": "Philadelphia Eagles", "league": "NFL", "aliases": ["Eagles"]},
            "cowboys": {"id": "DAL", "name": "Dallas Cowboys", "league": "NFL", "aliases": ["Cowboys"]},
            "49ers": {"id": "SF", "name": "San Francisco 49ers", "league": "NFL", "aliases": ["49ers", "Niners", "San Francisco"]},
            "bills": {"id": "BUF", "name": "Buffalo Bills", "league": "NFL", "aliases": ["Bills"]},
            "packers": {"id": "GB", "name": "Green Bay Packers", "league": "NFL", "aliases": ["Packers", "Green Bay"]},
            "ravens": {"id": "BAL", "name": "Baltimore Ravens", "league": "NFL", "aliases": ["Ravens"]},
            "bengals": {"id": "CIN", "name": "Cincinnati Bengals", "league": "NFL", "aliases": ["Bengals"]},
            "lions": {"id": "DET", "name": "Detroit Lions", "league": "NFL", "aliases": ["Lions"]},
            "patriots": {"id": "NE", "name": "New England Patriots", "league": "NFL", "aliases": ["Patriots", "Pats", "New England"]},
            "steelers": {"id": "PIT", "name": "Pittsburgh Steelers", "league": "NFL", "aliases": ["Steelers"]},
            "buccaneers": {"id": "TB", "name": "Tampa Bay Buccaneers", "league": "NFL", "aliases": ["Bucs", "Buccaneers", "Tampa Bay"]},
            "rams": {"id": "LAR", "name": "Los Angeles Rams", "league": "NFL", "aliases": ["Rams", "LA Rams"]},
            "vikings": {"id": "MIN", "name": "Minnesota Vikings", "league": "NFL", "aliases": ["Vikings"]},
            "texans": {"id": "HOU", "name": "Houston Texans", "league": "NFL", "aliases": ["Texans"]},
            "colts": {"id": "IND", "name": "Indianapolis Colts", "league": "NFL", "aliases": ["Colts"]},
            "saints": {"id": "NO", "name": "New Orleans Saints", "league": "NFL", "aliases": ["Saints"]},
            "falcons": {"id": "ATL", "name": "Atlanta Falcons", "league": "NFL", "aliases": ["Falcons"]},
            "seahawks": {"id": "SEA", "name": "Seattle Seahawks", "league": "NFL", "aliases": ["Seahawks"]},
            "raiders": {"id": "LV", "name": "Las Vegas Raiders", "league": "NFL", "aliases": ["Raiders"]},
            "broncos": {"id": "DEN", "name": "Denver Broncos", "league": "NFL", "aliases": ["Broncos"]},
            "chargers": {"id": "LAC", "name": "Los Angeles Chargers", "league": "NFL", "aliases": ["Chargers", "LA Chargers"]},
            "browns": {"id": "CLE", "name": "Cleveland Browns", "league": "NFL", "aliases": ["Browns"]},
            "cardinals": {"id": "ARI", "name": "Arizona Cardinals", "league": "NFL", "aliases": ["Cardinals", "Cards"]},
            "jaguars": {"id": "JAX", "name": "Jacksonville Jaguars", "league": "NFL", "aliases": ["Jaguars", "Jags"]},
            "bears": {"id": "CHI", "name": "Chicago Bears", "league": "NFL", "aliases": ["Bears"]},
            "giants": {"id": "NYG", "name": "New York Giants", "league": "NFL", "aliases": ["Giants", "NYG"]},
            "jets": {"id": "NYJ", "name": "New York Jets", "league": "NFL", "aliases": ["Jets"]},
            "commanders": {"id": "WAS", "name": "Washington Commanders", "league": "NFL", "aliases": ["Commanders", "Washington"]},
            "panthers": {"id": "CAR", "name": "Carolina Panthers", "league": "NFL", "aliases": ["Panthers"]},
            "dolphins": {"id": "MIA", "name": "Miami Dolphins", "league": "NFL", "aliases": ["Dolphins"]},
            "titans": {"id": "TEN", "name": "Tennessee Titans", "league": "NFL", "aliases": ["Titans"]},
            
            # MLB Teams (All 30 teams)
            "yankees": {"id": "NYY", "name": "New York Yankees", "league": "MLB", "aliases": ["Yankees", "NYY"]},
            "dodgers": {"id": "LAD", "name": "Los Angeles Dodgers", "league": "MLB", "aliases": ["Dodgers", "LA Dodgers"]},
            "braves": {"id": "ATL", "name": "Atlanta Braves", "league": "MLB", "aliases": ["Braves"]},
            "redsox": {"id": "BOS", "name": "Boston Red Sox", "league": "MLB", "aliases": ["Red Sox", "Sox"]},
            "astros": {"id": "HOU", "name": "Houston Astros", "league": "MLB", "aliases": ["Astros"]},
            "cubs": {"id": "CHC", "name": "Chicago Cubs", "league": "MLB", "aliases": ["Cubs"]},
            "cardinals_mlb": {"id": "STL", "name": "St. Louis Cardinals", "league": "MLB", "aliases": ["Cardinals", "Cards", "St. Louis"]},
            "mets": {"id": "NYM", "name": "New York Mets", "league": "MLB", "aliases": ["Mets"]},
            "phillies": {"id": "PHI", "name": "Philadelphia Phillies", "league": "MLB", "aliases": ["Phillies", "Phils"]},
            "padres": {"id": "SD", "name": "San Diego Padres", "league": "MLB", "aliases": ["Padres"]},
            "giants_mlb": {"id": "SF", "name": "San Francisco Giants", "league": "MLB", "aliases": ["Giants", "SF Giants"]},
            "guardians": {"id": "CLE", "name": "Cleveland Guardians", "league": "MLB", "aliases": ["Guardians"]},
            "bluejays": {"id": "TOR", "name": "Toronto Blue Jays", "league": "MLB", "aliases": ["Blue Jays", "Jays"]},
            "mariners": {"id": "SEA", "name": "Seattle Mariners", "league": "MLB", "aliases": ["Mariners", "M's"]},
            "rangers": {"id": "TEX", "name": "Texas Rangers", "league": "MLB", "aliases": ["Rangers"]},
            "tigers": {"id": "DET", "name": "Detroit Tigers", "league": "MLB", "aliases": ["Tigers"]},
            "orioles": {"id": "BAL", "name": "Baltimore Orioles", "league": "MLB", "aliases": ["Orioles", "O's"]},
            "twins": {"id": "MIN", "name": "Minnesota Twins", "league": "MLB", "aliases": ["Twins"]},
            "angels": {"id": "LAA", "name": "Los Angeles Angels", "league": "MLB", "aliases": ["Angels", "LA Angels"]},
            "whitesox": {"id": "CWS", "name": "Chicago White Sox", "league": "MLB", "aliases": ["White Sox", "Sox"]},
            "brewers": {"id": "MIL", "name": "Milwaukee Brewers", "league": "MLB", "aliases": ["Brewers"]},
            "diamondbacks": {"id": "ARI", "name": "Arizona Diamondbacks", "league": "MLB", "aliases": ["D-backs", "Diamondbacks"]},
            "rays": {"id": "TB", "name": "Tampa Bay Rays", "league": "MLB", "aliases": ["Rays"]},
            "reds": {"id": "CIN", "name": "Cincinnati Reds", "league": "MLB", "aliases": ["Reds"]},
            "marlins": {"id": "MIA", "name": "Miami Marlins", "league": "MLB", "aliases": ["Marlins"]},
            "rockies": {"id": "COL", "name": "Colorado Rockies", "league": "MLB", "aliases": ["Rockies"]},
            "athletics": {"id": "OAK", "name": "Oakland Athletics", "league": "MLB", "aliases": ["A's", "Athletics"]},
            "nationals": {"id": "WSH", "name": "Washington Nationals", "league": "MLB", "aliases": ["Nationals", "Nats"]},
            "royals": {"id": "KC", "name": "Kansas City Royals", "league": "MLB", "aliases": ["Royals"]},
            "pirates": {"id": "PIT", "name": "Pittsburgh Pirates", "league": "MLB", "aliases": ["Pirates", "Bucs"]},
            
            # NHL Teams (All 32 teams)
            "maple_leafs": {"id": "TOR", "name": "Toronto Maple Leafs", "league": "NHL", "aliases": ["Maple Leafs", "Leafs"]},
            "canadiens": {"id": "MTL", "name": "Montreal Canadiens", "league": "NHL", "aliases": ["Canadiens", "Habs"]},
            "bruins": {"id": "BOS", "name": "Boston Bruins", "league": "NHL", "aliases": ["Bruins"]},
            "rangers": {"id": "NYR", "name": "New York Rangers", "league": "NHL", "aliases": ["Rangers"]},
            "blackhawks": {"id": "CHI", "name": "Chicago Blackhawks", "league": "NHL", "aliases": ["Blackhawks", "Hawks"]},
            "oilers": {"id": "EDM", "name": "Edmonton Oilers", "league": "NHL", "aliases": ["Oilers"]},
            "penguins": {"id": "PIT", "name": "Pittsburgh Penguins", "league": "NHL", "aliases": ["Penguins", "Pens"]},
            "lightning": {"id": "TB", "name": "Tampa Bay Lightning", "league": "NHL", "aliases": ["Lightning", "Bolts"]},
            "avalanche": {"id": "COL", "name": "Colorado Avalanche", "league": "NHL", "aliases": ["Avalanche", "Avs"]},
            "flames": {"id": "CGY", "name": "Calgary Flames", "league": "NHL", "aliases": ["Flames"]},
            "capitals": {"id": "WSH", "name": "Washington Capitals", "league": "NHL", "aliases": ["Capitals", "Caps"]},
            "redwings": {"id": "DET", "name": "Detroit Red Wings", "league": "NHL", "aliases": ["Red Wings", "Wings"]},
            "golden_knights": {"id": "VGK", "name": "Vegas Golden Knights", "league": "NHL", "aliases": ["Golden Knights", "Knights", "Vegas"]},
            "flyers": {"id": "PHI", "name": "Philadelphia Flyers", "league": "NHL", "aliases": ["Flyers"]},
            "stars": {"id": "DAL", "name": "Dallas Stars", "league": "NHL", "aliases": ["Stars"]},
            "canucks": {"id": "VAN", "name": "Vancouver Canucks", "league": "NHL", "aliases": ["Canucks"]},
            "predators": {"id": "NSH", "name": "Nashville Predators", "league": "NHL", "aliases": ["Predators", "Preds"]},
            "devils": {"id": "NJ", "name": "New Jersey Devils", "league": "NHL", "aliases": ["Devils"]},
            "blues": {"id": "STL", "name": "St. Louis Blues", "league": "NHL", "aliases": ["Blues"]},
            "islanders": {"id": "NYI", "name": "New York Islanders", "league": "NHL", "aliases": ["Islanders", "Isles"]},
            "wild": {"id": "MIN", "name": "Minnesota Wild", "league": "NHL", "aliases": ["Wild"]},
            "kings": {"id": "LAK", "name": "Los Angeles Kings", "league": "NHL", "aliases": ["Kings", "LA Kings"]},
            "hurricanes": {"id": "CAR", "name": "Carolina Hurricanes", "league": "NHL", "aliases": ["Hurricanes", "Canes"]},
            "panthers_nhl": {"id": "FLA", "name": "Florida Panthers", "league": "NHL", "aliases": ["Panthers"]},
            "jets": {"id": "WPG", "name": "Winnipeg Jets", "league": "NHL", "aliases": ["Jets"]},
            "blue_jackets": {"id": "CBJ", "name": "Columbus Blue Jackets", "league": "NHL", "aliases": ["Blue Jackets", "CBJ"]},
            "senators": {"id": "OTT", "name": "Ottawa Senators", "league": "NHL", "aliases": ["Senators", "Sens"]},
            "sabres": {"id": "BUF", "name": "Buffalo Sabres", "league": "NHL", "aliases": ["Sabres"]},
            "ducks": {"id": "ANA", "name": "Anaheim Ducks", "league": "NHL", "aliases": ["Ducks"]},
            "sharks": {"id": "SJ", "name": "San Jose Sharks", "league": "NHL", "aliases": ["Sharks"]},
            "coyotes": {"id": "ARI", "name": "Arizona Coyotes", "league": "NHL", "aliases": ["Coyotes", "Yotes"]},
            "kraken": {"id": "SEA", "name": "Seattle Kraken", "league": "NHL", "aliases": ["Kraken"]},
            
            # EPL Teams (All 20 teams)
            "arsenal": {"id": "ARS", "name": "Arsenal", "league": "EPL", "aliases": ["Gunners", "The Arsenal"]},
            "liverpool": {"id": "LIV", "name": "Liverpool", "league": "EPL", "aliases": ["Reds", "LFC"]},
            "mancity": {"id": "MCI", "name": "Manchester City", "league": "EPL", "aliases": ["Man City", "City", "Citizens"]},
            "manutd": {"id": "MUN", "name": "Manchester United", "league": "EPL", "aliases": ["Man Utd", "United", "Red Devils"]},
            "chelsea": {"id": "CHE", "name": "Chelsea", "league": "EPL", "aliases": ["Blues", "The Blues", "CFC"]},
            "tottenham": {"id": "TOT", "name": "Tottenham Hotspur", "league": "EPL", "aliases": ["Spurs", "Tottenham"]},
            "newcastle": {"id": "NEW", "name": "Newcastle United", "league": "EPL", "aliases": ["Newcastle", "Magpies", "Toon"]},
            "astonvilla": {"id": "AVL", "name": "Aston Villa", "league": "EPL", "aliases": ["Villa"]},
            "westham": {"id": "WHU", "name": "West Ham United", "league": "EPL", "aliases": ["West Ham", "Hammers"]},
            "everton": {"id": "EVE", "name": "Everton", "league": "EPL", "aliases": ["Toffees"]},
            "brighton": {"id": "BHA", "name": "Brighton & Hove Albion", "league": "EPL", "aliases": ["Brighton", "Seagulls"]},
            "crystalpalace": {"id": "CRY", "name": "Crystal Palace", "league": "EPL", "aliases": ["Palace", "Eagles"]},
            "wolves": {"id": "WOL", "name": "Wolverhampton Wanderers", "league": "EPL", "aliases": ["Wolves"]},
            "leicester": {"id": "LEI", "name": "Leicester City", "league": "EPL", "aliases": ["Leicester", "Foxes"]},
            "brentford": {"id": "BRE", "name": "Brentford", "league": "EPL", "aliases": ["Bees"]},
            "fulham": {"id": "FUL", "name": "Fulham", "league": "EPL", "aliases": ["Cottagers"]},
            "bournemouth": {"id": "BOU", "name": "AFC Bournemouth", "league": "EPL", "aliases": ["Bournemouth", "Cherries"]},
            "southampton": {"id": "SOU", "name": "Southampton", "league": "EPL", "aliases": ["Saints"]},
            "nottinghamforest": {"id": "NFO", "name": "Nottingham Forest", "league": "EPL", "aliases": ["Forest"]},
            "ipswich": {"id": "IPS", "name": "Ipswich Town", "league": "EPL", "aliases": ["Ipswich", "Tractor Boys"]},
            
            # La Liga Teams (All 20 teams)
            "barcelona": {"id": "FCB", "name": "FC Barcelona", "league": "LALIGA", "aliases": ["Barça", "Barcelona", "Blaugrana"]},
            "realmadrid": {"id": "RMA", "name": "Real Madrid", "league": "LALIGA", "aliases": ["Madrid", "Los Blancos", "Los Merengues"]},
            "atletico": {"id": "ATM", "name": "Atletico Madrid", "league": "LALIGA", "aliases": ["Atleti", "Atletico", "Colchoneros"]},
            "sevilla": {"id": "SEV", "name": "Sevilla FC", "league": "LALIGA", "aliases": ["Sevilla"]},
            "valencia": {"id": "VAL", "name": "Valencia CF", "league": "LALIGA", "aliases": ["Valencia", "Los Che"]},
            "villarreal": {"id": "VIL", "name": "Villarreal CF", "league": "LALIGA", "aliases": ["Villarreal", "Yellow Submarine"]},
            "athleticbilbao": {"id": "ATH", "name": "Athletic Bilbao", "league": "LALIGA", "aliases": ["Athletic", "Athletic Club", "Bilbao"]},
            "realsociedad": {"id": "RSO", "name": "Real Sociedad", "league": "LALIGA", "aliases": ["La Real", "Sociedad"]},
            "betis": {"id": "BET", "name": "Real Betis", "league": "LALIGA", "aliases": ["Betis", "Los Verdiblancos"]},
            "getafe": {"id": "GET", "name": "Getafe CF", "league": "LALIGA", "aliases": ["Getafe", "Azulones"]},
            "osasuna": {"id": "OSA", "name": "CA Osasuna", "league": "LALIGA", "aliases": ["Osasuna", "Los Rojillos"]},
            "espanyol": {"id": "ESP", "name": "RCD Espanyol", "league": "LALIGA", "aliases": ["Espanyol", "Pericos"]},
            "celtavigo": {"id": "CEL", "name": "Celta Vigo", "league": "LALIGA", "aliases": ["Celta", "Célticos"]},
            "rayo": {"id": "RAY", "name": "Rayo Vallecano", "league": "LALIGA", "aliases": ["Rayo", "Los Franjirrojos"]},
            "mallorca": {"id": "MAL", "name": "RCD Mallorca", "league": "LALIGA", "aliases": ["Mallorca", "Los Bermellones"]},
            "revalladolid": {"id": "VLL", "name": "Real Valladolid", "league": "LALIGA", "aliases": ["Valladolid", "Pucela"]},
            "cadiz": {"id": "CAD", "name": "Cádiz CF", "league": "LALIGA", "aliases": ["Cádiz", "Submarino Amarillo"]},
            "alaves": {"id": "ALA", "name": "Deportivo Alavés", "league": "LALIGA", "aliases": ["Alavés", "Babazorros"]},
            "girona": {"id": "GIR", "name": "Girona FC", "league": "LALIGA", "aliases": ["Girona"]},
            "laspalmas": {"id": "LPA", "name": "UD Las Palmas", "league": "LALIGA", "aliases": ["Las Palmas"]},
            
            # Serie A Teams (All 20 teams)
            "juventus": {"id": "JUV", "name": "Juventus", "league": "SERIEA", "aliases": ["Juve", "Old Lady", "Bianconeri"]},
            "intermilan": {"id": "INT", "name": "Inter Milan", "league": "SERIEA", "aliases": ["Inter", "Nerazzurri"]},
            "acmilan": {"id": "MIL", "name": "AC Milan", "league": "SERIEA", "aliases": ["Milan", "Rossoneri"]},
            "roma": {"id": "ROM", "name": "AS Roma", "league": "SERIEA", "aliases": ["Roma", "Giallorossi"]},
            "napoli": {"id": "NAP", "name": "Napoli", "league": "SERIEA", "aliases": ["Azzurri", "Partenopei"]},
            "lazio": {"id": "LAZ", "name": "Lazio", "league": "SERIEA", "aliases": ["Biancocelesti"]},
            "atalanta": {"id": "ATA", "name": "Atalanta", "league": "SERIEA", "aliases": ["La Dea", "Nerazzurri"]},
            "fiorentina": {"id": "FIO", "name": "Fiorentina", "league": "SERIEA", "aliases": ["Viola", "La Viola"]},
            "bologna": {"id": "BOL", "name": "Bologna", "league": "SERIEA", "aliases": ["Rossoblù"]},
            "torino": {"id": "TOR", "name": "Torino", "league": "SERIEA", "aliases": ["Toro", "Granata"]},
            "udinese": {"id": "UDI", "name": "Udinese", "league": "SERIEA", "aliases": ["Zebrette", "Bianconeri"]},
            "sassuolo": {"id": "SAS", "name": "Sassuolo", "league": "SERIEA", "aliases": ["Neroverdi"]},
            "sampdoria": {"id": "SAM", "name": "Sampdoria", "league": "SERIEA", "aliases": ["Samp", "Blucerchiati"]},
            "cagliari": {"id": "CAG", "name": "Cagliari", "league": "SERIEA", "aliases": ["Isolani", "Rossoblu"]},
            "verona": {"id": "VER", "name": "Hellas Verona", "league": "SERIEA", "aliases": ["Verona", "Gialloblu"]},
            "genoa": {"id": "GEN", "name": "Genoa", "league": "SERIEA", "aliases": ["Grifone", "Rossoblu"]},
            "parma": {"id": "PAR", "name": "Parma", "league": "SERIEA", "aliases": ["Crociati", "Ducali"]},
            "empoli": {"id": "EMP", "name": "Empoli", "league": "SERIEA", "aliases": ["Azzurri"]},
            "monza": {"id": "MON", "name": "Monza", "league": "SERIEA", "aliases": ["Biancorossi"]},
            "lecce": {"id": "LEC", "name": "Lecce", "league": "SERIEA", "aliases": ["Giallorossi", "Salentini"]},
            
            # Bundesliga Teams (All 18 teams)
            "bayern": {"id": "BAY", "name": "Bayern Munich", "league": "BL", "aliases": ["Bayern", "FC Bayern", "Die Roten"]},
            "dortmund": {"id": "BVB", "name": "Borussia Dortmund", "league": "BL", "aliases": ["BVB", "Die Schwarzgelben"]},
            "leipzig": {"id": "RBL", "name": "RB Leipzig", "league": "BL", "aliases": ["Leipzig", "Die Roten Bullen"]},
            "leverkusen": {"id": "B04", "name": "Bayer Leverkusen", "league": "BL", "aliases": ["Leverkusen", "Die Werkself"]},
            "gladbach": {"id": "BMG", "name": "Borussia Mönchengladbach", "league": "BL", "aliases": ["Gladbach", "Die Fohlen"]},
            "wolfsburg": {"id": "WOB", "name": "VfL Wolfsburg", "league": "BL", "aliases": ["Wolfsburg", "Die Wölfe"]},
            "frankfurt": {"id": "SGE", "name": "Eintracht Frankfurt", "league": "BL", "aliases": ["Frankfurt", "Die Adler"]},
            "hoffenheim": {"id": "TSG", "name": "TSG Hoffenheim", "league": "BL", "aliases": ["Hoffenheim", "Die Kraichgauer"]},
            "stuttgart": {"id": "VFB", "name": "VfB Stuttgart", "league": "BL", "aliases": ["Stuttgart", "Die Schwaben"]},
            "union": {"id": "FCU", "name": "Union Berlin", "league": "BL", "aliases": ["Union", "Die Eisernen"]},
            "mainz": {"id": "M05", "name": "Mainz 05", "league": "BL", "aliases": ["Mainz", "Die Nullfünfer"]},
            "freiburg": {"id": "SCF", "name": "SC Freiburg", "league": "BL", "aliases": ["Freiburg", "Breisgau-Brasilianer"]},
            "cologne": {"id": "KOE", "name": "FC Cologne", "league": "BL", "aliases": ["Köln", "FC Köln", "Die Geißböcke"]},
            "werder": {"id": "SVW", "name": "Werder Bremen", "league": "BL", "aliases": ["Bremen", "Die Werderaner"]},
            "augsburg": {"id": "AUG", "name": "FC Augsburg", "league": "BL", "aliases": ["Augsburg", "FCA"]},
            "hertha": {"id": "BSC", "name": "Hertha Berlin", "league": "BL", "aliases": ["Hertha", "Die Alte Dame"]},
            "bochum": {"id": "BOC", "name": "VfL Bochum", "league": "BL", "aliases": ["Bochum", "Die Unabsteigbaren"]},
            "kiel": {"id": "KIE", "name": "Holstein Kiel", "league": "BL", "aliases": ["Kiel", "Die Störche"]}
        }
    
    def _initialize_player_nicknames(self):
        """Initialize comprehensive player nickname mappings"""
        player_nicknames = {
            # NBA Nicknames
            "King James": "LeBron James",
            "Chef Curry": "Stephen Curry",
            "Greek Freak": "Giannis Antetokounmpo",
            "The Joker": "Nikola Jokic",
            "The Process": "Joel Embiid",
            "The Slim Reaper": "Kevin Durant",
            "Luka Magic": "Luka Doncic",
            "Spida": "Donovan Mitchell",
            "Jimmy Buckets": "Jimmy Butler",
            "Dame Time": "Damian Lillard",
            "Brodie": "Russell Westbrook",
            "The Brow": "Anthony Davis",
            "The Klaw": "Kawhi Leonard",
            "CP3": "Chris Paul",
            "Flash": "Dwyane Wade",
            "The Truth": "Paul Pierce",
            "The Answer": "Allen Iverson",
            "The Mailman": "Karl Malone",
            "The Glove": "Gary Payton",
            "The Admiral": "David Robinson",
            "The Dream": "Hakeem Olajuwon",
            "AK-47": "Andrei Kirilenko",
            "Diesel": "Shaquille O'Neal",
            "The Big Fundamental": "Tim Duncan",
            "Vinsanity": "Vince Carter",
            
            # NFL Nicknames
            "TB12": "Tom Brady",
            "Showtime": "Patrick Mahomes",
            "A-Rod": "Aaron Rodgers",
            "Beast Mode": "Marshawn Lynch",
            "Megatron": "Calvin Johnson",
            "Cheetah": "Tyreek Hill",
            "Cool Brees": "Drew Brees",
            "Primetime": "Deion Sanders",
            "Broadway Joe": "Joe Namath",
            "Sweetness": "Walter Payton",
            "Mean Joe": "Joe Greene",
            "Night Train": "Dick Lane",
            "The Refrigerator": "William Perry",
            "The Sheriff": "Peyton Manning",
            "Mr. Clutch": "Joe Montana",
            "The Minister of Defense": "Reggie White",
            "LT": "Lawrence Taylor",
            "The Bus": "Jerome Bettis",
            "Gronk": "Rob Gronkowski",
            "The Freak": "Jevon Kearse",
            
            # MLB Nicknames
            "The Captain": "Derek Jeter",
            "The Kid": "Ken Griffey Jr.",
            "The Big Unit": "Randy Johnson",
            "The Panda": "Pablo Sandoval",
            "Mr. October": "Reggie Jackson",
            "Shotime": "Shohei Ohtani",
            "The Judge": "Aaron Judge",
            "El Mago": "Javier Báez",
            "Big Papi": "David Ortiz",
            "Joey Bats": "José Bautista",
            "The Machine": "Albert Pujols",
            "The Rocket": "Roger Clemens",
            "The Bambino": "Babe Ruth",
            "Hammerin' Hank": "Hank Aaron",
            "Stan the Man": "Stan Musial",
            "The Georgia Peach": "Ty Cobb",
            "Mr. Cub": "Ernie Banks",
            "Charlie Hustle": "Pete Rose",
            "The Iron Horse": "Lou Gehrig",
            "The Human Vacuum Cleaner": "Brooks Robinson",
            
            # NHL Nicknames
            "The Great One": "Wayne Gretzky",
            "Super Mario": "Mario Lemieux",
            "The Golden Jet": "Bobby Hull",
            "Mr. Hockey": "Gordie Howe",
            "The Dominator": "Dominik Hasek",
            "The Rocket": "Maurice Richard",
            "The Magnificent One": "Mario Lemieux",
            "The Finnish Flash": "Teemu Selanne",
            "The Russian Rocket": "Pavel Bure",
            "Captain Serious": "Jonathan Toews",
            "Flower": "Marc-Andre Fleury",
            "Jumbo Joe": "Joe Thornton",
            "The Rat": "Brad Marchand",
            "Big Z": "Zdeno Chara",
            "McJesus": "Connor McDavid",
            
            # Soccer Nicknames
            "The GOAT": "Lionel Messi",
            "CR7": "Cristiano Ronaldo",
            "The Egyptian King": "Mohamed Salah",
            "The Terminator": "Erling Haaland",
            "Captain America": "Christian Pulisic",
            "The Special One": "José Mourinho",
            "Zizou": "Zinedine Zidane",
            "El Pistolero": "Luis Suárez",
            "O Fenômeno": "Ronaldo Nazário",
            "The Flying Dutchman": "Robin van Persie",
            "The Kaiser": "Franz Beckenbauer",
            "El Pibe de Oro": "Diego Maradona",
            "O Rei": "Pelé",
            "The Black Pearl": "Eusébio",
            "The Baby-Faced Assassin": "Ole Gunnar Solskjær",
            "The Welsh Wizard": "Gareth Bale",
            "The Atomic Flea": "Lionel Messi",
            "Der Bomber": "Gerd Müller",
            "King Eric": "Eric Cantona",
            "The Divine Ponytail": "Roberto Baggio"
        }
        return player_nicknames
    
    def _load_conditions(self) -> Dict[str, Dict]:
        """Load comprehensive condition mappings for all 8 primary sports leagues"""
        try:
            conditions = {
                # Basketball conditions (NBA)
                "points": {
                    "id": "PTS", 
                    "sport": "basketball", 
                    "type": "scoring",
                    "aliases": ["points", "pts", "point", "scored", "score", "scoring", "buckets"]
                },
                "rebounds": {
                    "id": "REB", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["rebounds", "rebs", "boards", "reb", "rebounding", "glass cleaning"]
                },
                "assists": {
                    "id": "AST", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["assists", "ast", "dimes", "assist", "assisting", "feeds", "helpers"]
                },
                "steals": {
                    "id": "STL", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["steals", "stl", "steal", "stealing", "swipes", "takeaways"]
                },
                "blocks": {
                    "id": "BLK", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["blocks", "blk", "block", "blocking", "rejections", "swats"]
                },
                "three pointers": {
                    "id": "3PM", 
                    "sport": "basketball", 
                    "type": "scoring",
                    "aliases": ["three pointers", "3-pointers", "threes", "3pt", "3-pt", "3 pointers", "3's", "3s", "triples", "from downtown", "from beyond the arc"]
                },
                "double double": {
                    "id": "DD", 
                    "sport": "basketball", 
                    "type": "achievement",
                    "aliases": ["double double", "double-double", "double-doubles", "double doubles", "double digit in two categories"]
                },
                "triple double": {
                    "id": "TD", 
                    "sport": "basketball", 
                    "type": "achievement",
                    "aliases": ["triple double", "triple-double", "triple-doubles", "triple doubles", "double digit in three categories"]
                },
                "field goals": {
                    "id": "FG", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["field goals", "fg", "field goal", "shots", "shot", "made shots", "makes"]
                },
                "field goal percentage": {
                    "id": "FG_PCT", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["field goal percentage", "fg%", "shooting percentage", "shooting efficiency", "shot percentage"]
                },
                "free throws": {
                    "id": "FT", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["free throws", "ft", "free throw", "fts", "foul shots", "from the line"]
                },
                "free throw percentage": {
                    "id": "FT_PCT", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["free throw percentage", "ft%", "free throw efficiency", "foul shooting percentage"]
                },
                "three point percentage": {
                    "id": "3P_PCT", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["three point percentage", "3p%", "3pt%", "three-point efficiency", "3-point shooting percentage"]
                },
                "minutes": {
                    "id": "MIN", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["minutes", "mins", "playing time", "time played", "minutes played"]
                },
                "turnovers": {
                    "id": "TO", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["turnovers", "to", "turnover", "tos", "giveaways", "lost balls"]
                },
                "plus minus": {
                    "id": "PLUS_MINUS", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["plus minus", "+/-", "plus/minus", "net rating", "net points"]
                },
                "offensive rebounds": {
                    "id": "OREB", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["offensive rebounds", "oreb", "offensive boards", "o-boards", "offensive rebounding"]
                },
                "defensive rebounds": {
                    "id": "DREB", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["defensive rebounds", "dreb", "defensive boards", "d-boards", "defensive rebounding"]
                },
                "personal fouls": {
                    "id": "PF", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["personal fouls", "pf", "fouls", "personals", "foul trouble"]
                },
                "efficiency": {
                    "id": "EFF", 
                    "sport": "basketball", 
                    "type": "stat",
                    "aliases": ["efficiency", "eff", "efficiency rating", "player efficiency", "performance index rating"]
                },
                
                # Football conditions (NFL)
                "touchdowns": {
                    "id": "TD", 
                    "sport": "football", 
                    "type": "scoring",
                    "aliases": ["touchdowns", "td", "touchdown", "tds", "scores", "end zone"]
                },
                "passing touchdowns": {
                    "id": "PASS_TD", 
                    "sport": "football", 
                    "type": "scoring",
                    "aliases": ["passing touchdowns", "pass td", "passing td", "passing tds", "touchdown passes", "pass for td"]
                },
                "rushing touchdowns": {
                    "id": "RUSH_TD", 
                    "sport": "football", 
                    "type": "scoring",
                    "aliases": ["rushing touchdowns", "rush td", "rushing td", "rushing tds", "run for td", "ground scores"]
                },
                "receiving touchdowns": {
                    "id": "REC_TD", 
                    "sport": "football", 
                    "type": "scoring",
                    "aliases": ["receiving touchdowns", "rec td", "receiving td", "receiving tds", "td catch", "td reception"]
                },
                "passing yards": {
                    "id": "PASS_YDS", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["passing yards", "pass yards", "passing yds", "pass yds", "passing yard", "air yards", "yards through the air"]
                },
                "rushing yards": {
                    "id": "RUSH_YDS", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["rushing yards", "rush yards", "rushing yds", "rush yds", "rushing yard", "ground yards", "yards on the ground"]
                },
                "receiving yards": {
                    "id": "REC_YDS", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["receiving yards", "rec yards", "receiving yds", "rec yds", "receiving yard", "yards receiving"]
                },
                "interceptions": {
                    "id": "INT", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["interceptions", "int", "ints", "interception", "picks", "pick", "picked off"]
                },
                "interceptions thrown": {
                    "id": "INT_THROWN", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["interceptions thrown", "int thrown", "thrown int", "picks thrown", "thrown interceptions"]
                },
                "field goals": {
                    "id": "FG", 
                    "sport": "football", 
                    "type": "scoring",
                    "aliases": ["field goals", "fg", "field goal", "fgs", "kicks", "field goal kicks"]
                },
                "field goal percentage": {
                    "id": "FG_PCT", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["field goal percentage", "fg%", "field goal accuracy", "kick percentage"]
                },
                "receptions": {
                    "id": "REC", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["receptions", "rec", "catches", "catch", "reception", "balls caught"]
                },
                "targets": {
                    "id": "TGT", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["targets", "tgt", "targeted", "target", "passes thrown to"]
                },
                "sacks": {
                    "id": "SACK", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["sacks", "sack", "quarterback sacks", "qb sacks", "qb takedowns"]
                },
                "sacked": {
                    "id": "SACKED", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["sacked", "times sacked", "taken down", "qb hits", "sacks taken"]
                },
                "completions": {
                    "id": "COMP", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["completions", "comp", "completion", "comps", "complete", "completed passes"]
                },
                "completion percentage": {
                    "id": "COMP_PCT", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["completion percentage", "comp%", "completion rate", "completion efficiency", "pass completion rate"]
                },
                "passer rating": {
                    "id": "RATE", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["passer rating", "qb rating", "quarterback rating", "pass rating", "rating"]
                },
                "attempts": {
                    "id": "ATT", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["attempts", "att", "attempt", "pass attempts", "rushing attempts", "tries"]
                },
                "tackles": {
                    "id": "TACKLE", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["tackles", "tackle", "combined tackles", "total tackles", "tkl"]
                },
                "fumbles": {
                    "id": "FUM", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["fumbles", "fum", "fumble", "fumbled", "dropped ball"]
                },
                "fumble recoveries": {
                    "id": "FR", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["fumble recoveries", "fr", "fumble recovery", "recovered fumbles", "recovered fumble"]
                },
                "yards per carry": {
                    "id": "YPC", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["yards per carry", "ypc", "rushing average", "average per rush", "per carry average"]
                },
                "yards per reception": {
                    "id": "YPR", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["yards per reception", "ypr", "receiving average", "average per catch", "per reception average"]
                },
                "yards from scrimmage": {
                    "id": "YFS", 
                    "sport": "football", 
                    "type": "stat",
                    "aliases": ["yards from scrimmage", "yfs", "total yards", "scrimmage yards", "combined yards"]
                },
                "total touchdowns": {
                    "id": "TOTAL_TD", 
                    "sport": "football", 
                    "type": "scoring",
                    "aliases": ["total touchdowns", "total td", "all purpose td", "combined td", "total scores"]
                },
                "extra points": {
                    "id": "XP", 
                    "sport": "football", 
                    "type": "scoring",
                    "aliases": ["extra points", "xp", "pat", "point after", "point after touchdown", "extra point"]
                },
                
                # Baseball conditions (MLB)
                "home runs": {
                    "id": "HR", 
                    "sport": "baseball", 
                    "type": "scoring",
                    "aliases": ["home runs", "hr", "home run", "hrs", "homers", "homer", "dingers", "long balls"]
                },
                "hits": {
                    "id": "H", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["hits", "hit", "h", "base hits", "base hit"]
                },
                "at bats": {
                    "id": "AB", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["at bats", "ab", "at bat", "at-bats", "at-bat", "plate appearances"]
                },
                "runs": {
                    "id": "R", 
                    "sport": "baseball", 
                    "type": "scoring",
                    "aliases": ["runs", "run", "r", "runs scored", "crossed the plate"]
                },
                "runs batted in": {
                    "id": "RBI", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["runs batted in", "rbi", "rbis", "batted in", "driven in"]
                },
                "stolen bases": {
                    "id": "SB", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["stolen bases", "sb", "stolen base", "steals", "steal", "swipes", "swipe"]
                },
                "strikeouts": {
                    "id": "K", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["strikeouts", "k", "strikeout", "ks", "strike out", "strike outs", "struck out", "punch out"]
                },
                "strikeouts pitched": {
                    "id": "K_PITCH", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["strikeouts pitched", "pitcher strikeouts", "pitching strikeouts", "k's pitched", "struck out batters"]
                },
                "batting average": {
                    "id": "AVG", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["batting average", "avg", "average", "ba", "hitting average"]
                },
                "earned run average": {
                    "id": "ERA", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["earned run average", "era", "era", "pitching era"]
                },
                "innings pitched": {
                    "id": "IP", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["innings pitched", "ip", "innings", "inning", "frames pitched"]
                },
                "walks": {
                    "id": "BB", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["walks", "walk", "bb", "base on balls", "free pass", "passes"]
                },
                "saves": {
                    "id": "SV", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["saves", "save", "sv", "game saves", "closing"]
                },
                "wins": {
                    "id": "W", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["wins", "win", "w", "winning decision", "pitching wins", "pitcher wins"]
                },
                "losses": {
                    "id": "L", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["losses", "loss", "l", "losing decision", "pitching losses", "pitcher losses"]
                },
                "on base percentage": {
                    "id": "OBP", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["on base percentage", "obp", "on-base", "obp", "on base %"]
                },
                "slugging percentage": {
                    "id": "SLG", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["slugging percentage", "slg", "slugging", "slg%", "slugging %"]
                },
                "on base plus slugging": {
                    "id": "OPS", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["on base plus slugging", "ops", "on-base plus slugging", "total offensive production"]
                },
                "whip": {
                    "id": "WHIP", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["whip", "walks hits per inning", "walks and hits per inning pitched"]
                },
                "doubles": {
                    "id": "2B", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["doubles", "double", "2b", "two-base hit", "two bagger"]
                },
                "triples": {
                    "id": "3B", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["triples", "triple", "3b", "three-base hit", "three bagger"]
                },
                "earned runs": {
                    "id": "ER", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["earned runs", "er", "earned run", "runs allowed", "earned runs allowed"]
                },
                "quality starts": {
                    "id": "QS", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["quality starts", "qs", "quality start", "6+ innings with 3 or fewer earned runs"]
                },
                "complete games": {
                    "id": "CG", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["complete games", "cg", "complete game", "pitched complete game", "went the distance"]
                },
                "shutouts": {
                    "id": "SHO", 
                    "sport": "baseball", 
                    "type": "stat",
                    "aliases": ["shutouts", "shutout", "sho", "shut out", "pitched shutout", "no runs allowed"]
                },
                
                # Hockey conditions (NHL)
                "hockey goals": {
                    "id": "G_NHL", 
                    "sport": "hockey", 
                    "type": "scoring",
                    "aliases": ["goals", "goal", "hockey goals", "hockey goal", "scored", "pucks in net"]
                },
                "hockey assists": {
                    "id": "A_NHL", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["assists", "assist", "hockey assists", "hockey assist", "helpers", "apples"]
                },
                "points": {
                    "id": "PTS_NHL", 
                    "sport": "hockey", 
                    "type": "scoring",
                    "aliases": ["points", "pts", "point", "hockey points", "goals plus assists"]
                },
                "plus minus": {
                    "id": "PM_NHL", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["plus minus", "plus-minus", "+/-", "plus/minus", "differential"]
                },
                "penalty minutes": {
                    "id": "PIM", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["penalty minutes", "pim", "penalties", "sin bin", "minutes in box"]
                },
                "power play goals": {
                    "id": "PPG", 
                    "sport": "hockey", 
                    "type": "scoring",
                    "aliases": ["power play goals", "pp goals", "ppg", "power play goal", "man advantage goals"]
                },
                "short handed goals": {
                    "id": "SHG", 
                    "sport": "hockey", 
                    "type": "scoring",
                    "aliases": ["short handed goals", "shorthanded goals", "sh goals", "shg", "shorty", "shorties"]
                },
                "game winning goals": {
                    "id": "GWG", 
                    "sport": "hockey", 
                    "type": "scoring",
                    "aliases": ["game winning goals", "game winners", "gwg", "game winning goal", "winning goal"]
                },
                "shots on goal": {
                    "id": "SOG", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["shots on goal", "shots", "sog", "shots on net", "pucks on net"]
                },
                "save percentage": {
                    "id": "SV_PCT", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["save percentage", "save %", "sv%", "saves percentage", "goalie save rate"]
                },
                "goals against average": {
                    "id": "GAA", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["goals against average", "gaa", "goals allowed average", "average goals against"]
                },
                "hockey wins": {
                    "id": "W_NHL", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["wins", "win", "hockey wins", "goalie wins", "winning games"]
                },
                "hockey losses": {
                    "id": "L_NHL", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["losses", "loss", "hockey losses", "goalie losses", "losing games"]
                },
                "overtime losses": {
                    "id": "OTL", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["overtime losses", "ot losses", "otl", "ot loss", "overtime/shootout losses"]
                },
                "shutouts": {
                    "id": "SO", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["shutouts", "shutout", "so", "clean sheet", "no goals allowed"]
                },
                "time on ice": {
                    "id": "TOI", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["time on ice", "toi", "ice time", "playing time", "minutes played"]
                },
                "blocked shots": {
                    "id": "BS", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["blocked shots", "blocks", "shot blocks", "blocked shots", "shot blocking"]
                },
                "takeaways": {
                    "id": "TK", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["takeaways", "takeaway", "tk", "steals", "puck steals"]
                },
                "giveaways": {
                    "id": "GV", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["giveaways", "giveaway", "gv", "turnovers", "puck turnovers"]
                },
                "hits": {
                    "id": "HIT", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["hits", "hit", "body checks", "checks", "body contact"]
                },
                "faceoff percentage": {
                    "id": "FO_PCT", 
                    "sport": "hockey", 
                    "type": "stat",
                    "aliases": ["faceoff percentage", "faceoff %", "fo%", "faceoff win rate", "draw percentage"]
                },
                
                # Soccer conditions (Premier League, La Liga, Serie A, Bundesliga)
                "soccer goals": {
                    "id": "G_SOC", 
                    "sport": "soccer", 
                    "type": "scoring",
                    "aliases": ["goals", "goal", "soccer goals", "soccer goal", "scored", "netted"]
                },
                "soccer assists": {
                    "id": "A_SOC", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["assists", "assist", "soccer assists", "soccer assist", "setup", "helpers"]
                },
                "shots": {
                    "id": "SHT", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["shots", "shot", "attempts", "attempt", "shots taken", "shot attempts"]
                },
                "shots on target": {
                    "id": "SOT", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["shots on target", "shots on goal", "shot on target", "shot on goal", "sot", "on target attempts"]
                },
                "passes": {
                    "id": "PASS", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["passes", "pass", "passing", "completed passes", "pass completion"]
                },
                "key passes": {
                    "id": "KEY_PASS", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["key passes", "key pass", "chance created", "chances created", "key balls"]
                },
                "pass accuracy": {
                    "id": "PASS_ACC", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["pass accuracy", "passing accuracy", "pass completion rate", "pass percentage", "pass %"]
                },
                "tackles": {
                    "id": "TCK", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["tackles", "tackle", "tck", "tackling", "successful tackles"]
                },
                "interceptions": {
                    "id": "INT_SOC", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["interceptions", "interception", "int", "intercepted passes", "reading the game"]
                },
                "saves": {
                    "id": "SV_SOC", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["saves", "save", "sv", "goalkeeper saves", "shots saved"]
                },
                "clean sheets": {
                    "id": "CS", 
                    "sport": "soccer", 
                    "type": "achievement",
                    "aliases": ["clean sheets", "clean sheet", "shutout", "shutouts", "cs", "no goals conceded"]
                },
                "goals conceded": {
                    "id": "GA", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["goals conceded", "goals against", "goals allowed", "conceded", "let in"]
                },
                "penalty goals": {
                    "id": "PEN_GOAL", 
                    "sport": "soccer", 
                    "type": "scoring",
                    "aliases": ["penalty goals", "penalty goal", "penalty kick goals", "penalties scored", "converted penalties"]
                },
                "penalty missed": {
                    "id": "PEN_MISS", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["penalty missed", "missed penalty", "penalty miss", "failed penalty", "penalty saved"]
                },
                "yellow cards": {
                    "id": "YC", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["yellow cards", "yellow card", "yc", "caution", "cautioned", "booked"]
                },
                "red cards": {
                    "id": "RC", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["red cards", "red card", "rc", "sent off", "dismissal", "ejected"]
                },
                "fouls": {
                    "id": "FOUL", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["fouls", "foul", "committed fouls", "foul committed", "infringements"]
                },
                "fouls won": {
                    "id": "FOUL_W", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["fouls won", "won fouls", "fouled", "free kicks won", "drawn fouls"]
                },
                "offsides": {
                    "id": "OFF", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["offsides", "offside", "off", "caught offside", "offside position"]
                },
                "crosses": {
                    "id": "CRS", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["crosses", "cross", "crossing", "crossed balls", "balls into box"]
                },
                "dribbles": {
                    "id": "DRB", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["dribbles", "dribble", "successful dribbles", "take-ons", "beaten opponent"]
                },
                "duels won": {
                    "id": "DUE_W", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["duels won", "won duels", "successful duels", "aerial duels won", "ground duels won"]
                },
                "minutes played": {
                    "id": "MIN_SOC", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["minutes played", "minutes", "mins played", "playing time", "time on pitch"]
                },
                "goals per game": {
                    "id": "GPG", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["goals per game", "gpg", "goal ratio", "scoring rate", "goals per match"]
                },
                "hat tricks": {
                    "id": "HAT", 
                    "sport": "soccer", 
                    "type": "achievement",
                    "aliases": ["hat tricks", "hat trick", "hat-trick", "three goals in a game", "treble"]
                },
                "penalty save percentage": {
                    "id": "PEN_SAVE", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["penalty save percentage", "penalty saves", "saved penalties", "penalty save rate"]
                },
                "save percentage": {
                    "id": "SAVE_PCT", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["save percentage", "save rate", "saving percentage", "goalkeeper efficiency"]
                },
                "expected goals": {
                    "id": "XG", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["expected goals", "xg", "xgoals", "goal expectancy", "expected scoring"]
                },
                "expected assists": {
                    "id": "XA", 
                    "sport": "soccer", 
                    "type": "stat",
                    "aliases": ["expected assists", "xa", "xassists", "assist expectancy", "expected setups"]
                },
                
                # General win/loss conditions (All Sports)
                "win": {
                    "id": "WIN", 
                    "sport": "all", 
                    "type": "outcome",
                    "aliases": ["win", "wins", "winning", "victory", "beat", "defeat", "defeats", "victorious"]
                },
                "lose": {
                    "id": "LOSS", 
                    "sport": "all", 
                    "type": "outcome",
                    "aliases": ["lose", "loss", "losing", "lost", "defeated", "beaten", "falls to"]
                },
                "draw": {
                    "id": "DRAW", 
                    "sport": "all", 
                    "type": "outcome",
                    "aliases": ["draw", "tie", "ties", "tied", "drawn", "drawing", "stalemate"]
                },
                "winning margin": {
                    "id": "WIN_MARGIN", 
                    "sport": "all", 
                    "type": "margin",
                    "aliases": ["winning margin", "margin", "point differential", "point difference", "spread", "win by"]
                },
                "score first": {
                    "id": "SCORE_FIRST", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["score first", "first to score", "first goal", "first point", "first basket", "opening score"]
                },
                "winning at halftime": {
                    "id": "WIN_HT", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["winning at halftime", "lead at half", "halftime lead", "ahead at half", "winning at half", "half-time lead"]
                },
                "winning after first quarter": {
                    "id": "WIN_Q1", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["winning after first quarter", "lead after q1", "first quarter lead", "ahead after first", "winning first quarter"]
                },
                "winning after first period": {
                    "id": "WIN_P1", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["winning after first period", "lead after p1", "first period lead", "ahead after first", "winning first period"]
                },
                "comeback": {
                    "id": "COMEBACK", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["comeback", "come back", "come from behind", "rally", "rallying", "overcome deficit"]
                },
                "total points": {
                    "id": "TOTAL", 
                    "sport": "all", 
                    "type": "totals",
                    "aliases": ["total points", "total", "combined score", "total score", "over/under", "over under", "o/u"]
                },
                "over": {
                    "id": "OVER", 
                    "sport": "all", 
                    "type": "totals",
                    "aliases": ["over", "over the total", "more than", "exceeds", "surpasses"]
                },
                "under": {
                    "id": "UNDER", 
                    "sport": "all", 
                    "type": "totals",
                    "aliases": ["under", "under the total", "less than", "below", "doesn't reach"]
                },
                "final score": {
                    "id": "FINAL", 
                    "sport": "all", 
                    "type": "score",
                    "aliases": ["final score", "end result", "final result", "scoreline", "final tally"]
                },
                "home win": {
                    "id": "HOME_WIN", 
                    "sport": "all", 
                    "type": "outcome",
                    "aliases": ["home win", "home victory", "home team wins", "home side wins", "hosts win"]
                },
                "away win": {
                    "id": "AWAY_WIN", 
                    "sport": "all", 
                    "type": "outcome",
                    "aliases": ["away win", "away victory", "away team wins", "visitors win", "road win"]
                },
                "overtime": {
                    "id": "OT", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["overtime", "ot", "extra time", "et", "goes to overtime", "extended play"]
                },
                "shootout": {
                    "id": "SO", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["shootout", "penalty shootout", "goes to shootout", "decided by penalties", "so"]
                },
                "double overtime": {
                    "id": "DOT", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["double overtime", "2ot", "dot", "second overtime", "2x overtime"]
                },
                "triple overtime": {
                    "id": "TOT", 
                    "sport": "all", 
                    "type": "event",
                    "aliases": ["triple overtime", "3ot", "tot", "third overtime", "3x overtime"]
                }
            }
            return conditions
        except Exception as e:
            logger.error(f"Error loading conditions: {str(e)}")
            return {}
    
    def _initialize_vectors(self):
        """Initialize entity vectors for semantic matching"""
        try:
            # Initialize condition vectors
            vec = TfidfVectorizer(stop_words='english')
            
            # Process conditions with aliases
            all_condition_texts = []
            for condition_name, condition_data in self.conditions.items():
                all_texts = [condition_name] + condition_data.get("aliases", [])
                all_condition_texts.extend([text.lower() for text in all_texts])
            
            if all_condition_texts:
                # Fit vectorizer once on all condition texts
                condition_matrix = vec.fit_transform(all_condition_texts)
                condition_features = vec.get_feature_names_out()
                
                # Create vectors for each condition by name
                for condition_name, condition_data in self.conditions.items():
                    all_texts = [condition_name] + condition_data.get("aliases", [])
                    for text in all_texts:
                        text_lower = text.lower()
                        if text_lower in all_condition_texts:
                            idx = all_condition_texts.index(text_lower)
                            self._condition_vectors[text_lower] = condition_matrix[idx].toarray()[0]
            
            # Initialize team vectors
            team_names = []
            for team_data in self.teams.values():
                team_names.append(team_data["name"].lower())
                team_names.extend([alias.lower() for alias in team_data.get("aliases", [])])
            
            if team_names:
                # Fit vectorizer once on all team names
                team_matrix = vec.fit_transform(team_names)
                team_features = vec.get_feature_names_out()
                
                # Create vectors for each team
                idx = 0
                for team_data in self.teams.values():
                    self._team_vectors[team_data["name"].lower()] = team_matrix[idx].toarray()[0]
                    idx += 1
                    for alias in team_data.get("aliases", []):
                        self._team_vectors[alias.lower()] = team_matrix[idx].toarray()[0]
                        idx += 1
            
            # Initialize player vectors
            player_names = []
            for player_data in self.players.values():
                player_names.append(player_data["name"].lower())
                player_names.extend([alias.lower() for alias in player_data.get("aliases", [])])
            
            if player_names:
                # Fit vectorizer once on all player names
                player_matrix = vec.fit_transform(player_names)
                player_features = vec.get_feature_names_out()
                
                # Create vectors for each player
                idx = 0
                for player_data in self.players.values():
                    self._player_vectors[player_data["name"].lower()] = player_matrix[idx].toarray()[0]
                    idx += 1
                    for alias in player_data.get("aliases", []):
                        self._player_vectors[alias.lower()] = player_matrix[idx].toarray()[0]
                        idx += 1
            
            # Initialize league vectors
            league_names = []
            for league_data in self.leagues.values():
                league_names.append(league_data["name"].lower())
                league_names.extend([alias.lower() for alias in league_data.get("aliases", [])])
            
            if league_names:
                # Fit vectorizer once on all league names
                league_matrix = vec.fit_transform(league_names)
                league_features = vec.get_feature_names_out()
                
                # Create vectors for each league
                idx = 0
                for league_data in self.leagues.values():
                    self._league_vectors[league_data["name"].lower()] = league_matrix[idx].toarray()[0]
                    idx += 1
                    for alias in league_data.get("aliases", []):
                        self._league_vectors[alias.lower()] = league_matrix[idx].toarray()[0]
                        idx += 1
            
            logger.info("Entity vectors initialized successfully")
                
        except Exception as e:
            logger.error(f"Error initializing vectors: {str(e)}")
    
    def _extract_general_conditions(self, doc, parsed: ParsedFactor):
        """Extract conditions using more general pattern matching"""
        # Look for patterns like "Player scores X points"
        verbs_of_interest = ["score", "get", "have", "make", "achieve", "record", "post", "win", "lose"]
        
        for token in doc:
            if token.lemma_ in verbs_of_interest:
                # Look for direct objects that might be conditions
                for child in token.children:
                    if child.dep_ in ["dobj", "nsubj", "attr"]:
                        condition_text = child.text
                        
                        # Check if this matches any known condition
                        best_match, score = self._semantic_match(condition_text, self.conditions.keys())
                        if score > 0.7:
                            # Look for numeric values in the same clause
                            value = None
                            comparison = "="
                            
                            for sibling in token.children:
                                if sibling.like_num:
                                    value = float(sibling.text) if sibling.text.replace('.', '', 1).isdigit() else None
                                    
                                    # Check for comparison modifiers
                                    for comp_child in sibling.children:
                                        if comp_child.text in ["more", "greater", "above", "over"]:
                                            comparison = ">"
                                        elif comp_child.text in ["less", "fewer", "under", "below"]:
                                            comparison = "<"
                            
                            if value is not None:
                                # Create condition object
                                condition = Condition(
                                    text=best_match,
                                    type=self.conditions.get(best_match, {}).get("type", "unknown"),
                                    value=value,
                                    comparison_type=comparison
                                )
                                
                                # Add to parsed factor
                                parsed.conditions.append(condition)
                                logger.info(f"Extracted general condition '{best_match}' with value {value}")
    
    def _extract_temporal_info(self, doc, parsed: ParsedFactor):
        """Extract detailed temporal information from text"""
        time_frame = ""
        time_position = ""
        
        # Look for time frame patterns
        for token in doc:
            token_text = token.text.lower()
            
            # Check for time frames
            for frame, patterns in self.time_frames.items():
                if any(pattern in token_text for pattern in patterns):
                    time_frame = frame
                    
                    # Check for position modifiers
                    for position, pos_patterns in self.time_positions.items():
                        # Check this token and previous tokens
                        window = [token_text]
                        for i in range(max(0, token.i - 2), token.i):
                            window.append(doc[i].text.lower())
                        
                        if any(pattern in ' '.join(window) for pattern in pos_patterns):
                            time_position = position
                            break
                    
                    # Store in all conditions
                    for condition in parsed.conditions:
                        condition.time_frame = time_frame
                        condition.time_position = time_position
                    
                    # For backward compatibility
                    parsed.time_frame = time_frame
                    
                    logger.info(f"Extracted time frame: {time_frame} {time_position}")
                    break
    
    def _detect_negation(self, doc, parsed: ParsedFactor):
        """Detect negation in the text and update conditions accordingly"""
        # First try advanced negation model
        if self.negation_model:
            try:
                result = self.negation_model(doc.text)
                label = result[0]["label"]
                score = result[0]["score"]
                
                # Check if negation was detected with confidence
                if label == "NEG" and score > 0.7:
                    # Apply negation to all conditions
                    for condition in parsed.conditions:
                        condition.is_negated = True
                        # Invert comparison type
                        if condition.comparison_type == ">":
                            condition.comparison_type = "<="
                        elif condition.comparison_type == "<":
                            condition.comparison_type = ">="
                        elif condition.comparison_type == ">=":
                            condition.comparison_type = "<"
                        elif condition.comparison_type == "<=":
                            condition.comparison_type = ">"
                        elif condition.comparison_type == "=":
                            # For equality, just flip the confidence down
                            condition.confidence = max(0.1, condition.confidence - 0.3)
                    
                    logger.info(f"Detected negation with score {score}")
                    return
            except Exception as e:
                logger.error(f"Error in negation detection: {str(e)}")
        
        # Fallback to pattern-based negation detection
        negation_terms = ["not", "n't", "don't", "doesn't", "won't", "isn't", "aren't", "didn't", "no"]
        
        for token in doc:
            if token.text.lower() in negation_terms or token.lemma_.lower() in negation_terms:
                # Find the scope of negation (usually affects the next verb phrase)
                # First check for direct dependencies
                for child in token.children:
                    if child.pos_ in ["VERB", "AUX"]:
                        # Apply negation to all conditions
                        for condition in parsed.conditions:
                            condition.is_negated = True
                            # Invert comparison type as above
                            if condition.comparison_type == ">":
                                condition.comparison_type = "<="
                            elif condition.comparison_type == "<":
                                condition.comparison_type = ">="
                            elif condition.comparison_type == ">=":
                                condition.comparison_type = "<"
                            elif condition.comparison_type == "<=":
                                condition.comparison_type = ">"
                
                logger.info(f"Detected pattern-based negation with term: {token.text}")
                break
    
    def _resolve_coreferences(self, text: str, parsed: ParsedFactor):
        """Resolve coreferences to connect entities across sentences"""
        if not self.nlp or not hasattr(self.nlp, 'pipe_names') or 'neuralcoref' not in self.nlp.pipe_names:
            logger.info("NeuralCoref not available, skipping coreference resolution")
            return
        
        try:
            doc = self.nlp(text)
            
            # Check if document has coreferences
            if doc._.has_coref:
                # Get all clusters
                clusters = doc._.coref_clusters
                
                # Process each cluster
                for cluster in clusters:
                    # Get the main mention (usually the most specific one)
                    main_mention = cluster.main
                    main_text = main_mention.text
                    
                    # Check if this mention refers to a known entity
                    entity_type = None
                    entity_name = None
                    
                    # Check for player mentions
                    for player_key, player_info in self.players.items():
                        if player_info["name"].lower() in main_text.lower() or player_key.lower() in main_text.lower():
                            entity_type = "player"
                            entity_name = player_info["name"]
                            break
                    
                    # Check for team mentions if no player found
                    if not entity_type:
                        for team_key, team_info in self.teams.items():
                            if team_info["name"].lower() in main_text.lower() or team_key.lower() in main_text.lower():
                                entity_type = "team"
                                entity_name = team_info["name"]
                                break
                    
                    # If we found an entity, store all mentions
                    if entity_type and entity_name:
                        # Store all mentions for this entity
                        for mention in cluster.mentions:
                            mention_text = mention.text
                            parsed.references[mention_text] = entity_name
                            
                            # If the entity hasn't been set yet and this is a pronoun, set it
                            if entity_type == "player" and not parsed.player and mention.root.pos_ == "PRON":
                                parsed.team = entity_name
                                logger.info(f"Resolved coreference: {mention_text} -> {entity_name} (team)")
                                
            logger.info("Completed coreference resolution")
        
        except Exception as e:
            logger.error(f"Error in coreference resolution: {str(e)}")
    
    def _extract_regex_info(self, text: str, parsed: ParsedFactor):
        """Extract information using regex patterns as fallback"""
        # Extract potential teams
        for team_key, team_info in self.teams.items():
            if team_key.lower() in text.lower() or team_info["name"].lower() in text.lower():
                parsed.team = team_info["name"]
                parsed.entity_type = "team"
                
                # Set team's league if available
                if "league" in team_info:
                    for league_key, league_info in self.leagues.items():
                        if league_info["id"] == team_info["league"]:
                            parsed.league = league_info["name"]
                            break
                
                logger.info(f"Regex identified team: {parsed.team}")
                break
        
        # Extract potential players
        for player_key, player_info in self.players.items():
            if player_key.lower() in text.lower() or player_info["name"].lower() in text.lower():
                parsed.player = player_info["name"]
                parsed.entity_type = "player"
                
                # Set player's team if available
                if "team" in player_info:
                    for team_key, team_info in self.teams.items():
                        if team_info["id"] == player_info["team"]:
                            parsed.team = team_info["name"]
                            break
                
                logger.info(f"Regex identified player: {parsed.player}")
                break
        
        # Extract potential leagues
        for league_key, league_info in self.leagues.items():
            if league_key.lower() in text.lower() or league_info["name"].lower() in text.lower():
                parsed.league = league_info["name"]
                logger.info(f"Regex identified league: {parsed.league}")
                break
        
        # Extract potential conditions
        for condition_key, condition_info in self.conditions.items():
            # Check main condition name
            if condition_key.lower() in text.lower():
                condition = Condition(
                    text=condition_key,
                    type=condition_info.get("type", "unknown")
                )
                parsed.conditions.append(condition)
                logger.info(f"Regex identified condition: {condition_key}")
                continue
            
            # Check aliases
            for alias in condition_info.get("aliases", []):
                if alias.lower() in text.lower():
                    condition = Condition(
                        text=condition_key,
                        type=condition_info.get("type", "unknown")
                    )
                    parsed.conditions.append(condition)
                    logger.info(f"Regex identified condition from alias: {alias} -> {condition_key}")
                    break
        
        # Extract numeric values, comparison operators, and time frames
        self._extract_numeric_values(text, parsed)
    
    def _extract_numeric_values(self, text: str, parsed: ParsedFactor):
        """Extract numeric values, comparison operators, and time frames using regex"""
        # Extract numbers with context
        # This pattern handles decimal numbers and looks for surrounding context
        num_patterns = [
            r'(\w+\s+)?([><]=?|at least|at most|more than|less than|exactly|under|over|above|below)?\s*(\d+(?:\.\d+)?)',
            r'(\d+(?:\.\d+)?)\s*([><]=?|or more|or less|or higher|or lower)?(\s+\w+)?'
        ]
        
        for pattern in num_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                groups = match.groups()
                if len(groups) >= 3:
                    # Extract the numeric value
                    numeric_value = float(re.search(r'\d+(?:\.\d+)?', groups[2] if groups[2] else groups[0]).group(0))
                    
                    # Determine comparison type
                    comparison = "="
                    if groups[1]:
                        comp_text = groups[1].lower()
                        if any(term in comp_text for term in [">=", "at least", "or more", "or higher"]):
                            comparison = ">="
                        elif any(term in comp_text for term in ["<=", "at most", "or less", "or lower"]):
                            comparison = "<="
                        elif any(term in comp_text for term in [">", "more than", "above", "over"]):
                            comparison = ">"
                        elif any(term in comp_text for term in ["<", "less than", "under", "below"]):
                            comparison = "<"
                        elif any(term in comp_text for term in ["exactly", "="]):
                            comparison = "="
                    
                    # Assign the numeric value to conditions
                    if parsed.conditions:
                        # Assign to the most recently added condition
                        parsed.conditions[-1].value = numeric_value
                        parsed.conditions[-1].comparison_type = comparison
                        logger.info(f"Assigned numeric value {numeric_value} with comparison {comparison} to condition")
                    else:
                        # No condition found yet, create a placeholder
                        condition = Condition(
                            text="unknown",
                            type="unknown",
                            value=numeric_value,
                            comparison_type=comparison
                        )
                        parsed.conditions.append(condition)
                        logger.info(f"Created placeholder condition with value {numeric_value} and comparison {comparison}")
        
        # Extract time frames
        for frame, patterns in self.time_frames.items():
            for pattern in patterns:
                if pattern in text.lower():
                    # Determine position (first, second, etc.)
                    position = ""
                    for pos, pos_patterns in self.time_positions.items():
                        window_size = 10  # Look for position words within 10 words of the time frame
                        words = text.lower().split()
                        frame_idx = -1
                        
                        # Find the position of the time frame word
                        for i, word in enumerate(words):
                            if pattern in word:
                                frame_idx = i
                                break
                        
                        if frame_idx != -1:
                            # Look for position words around the time frame
                            start = max(0, frame_idx - window_size)
                            end = min(len(words), frame_idx + window_size)
                            window = ' '.join(words[start:end])
                            
                            if any(pos_pattern in window for pos_pattern in pos_patterns):
                                position = pos
                                break
                    
                    # Assign time frame to all conditions
                    for condition in parsed.conditions:
                        condition.time_frame = frame
                        condition.time_position = position
                    
                    # For backward compatibility
                    parsed.time_frame = frame
                    
                    logger.info(f"Extracted time frame: {frame} {position}")
                    break
    
    def _extract_conditions(self, text: str, parsed: ParsedFactor):
        """Extract multiple conditions from text with compound conditional support"""
        # If already has conditions from other methods, don't override
        if parsed.conditions:
            return
        
        # Split the text on potential compound operators
        if parsed.condition_operator != "NONE":
            # Determine the separator based on the operator
            op_patterns = []
            for op_text, op_type in self.compound_operators.items():
                if op_type == parsed.condition_operator:
                    op_patterns.append(r'\b' + re.escape(op_text) + r'\b')
            
            if op_patterns:
                # Join patterns with OR
                pattern = '|'.join(op_patterns)
                # Split the text on these operators
                segments = re.split(pattern, text)
                
                # Parse each segment separately
                for segment in segments:
                    if len(segment.strip()) > 3:  # Ignore very short segments
                        self._extract_single_condition(segment, parsed)
        else:
            # Just extract a single condition
            self._extract_single_condition(text, parsed)
    
    def _extract_single_condition(self, text: str, parsed: ParsedFactor):
        """Extract a single condition from text segment"""
        # First try to match with known conditions
        best_condition = None
        best_score = 0.0
        
        for condition_name, condition_info in self.conditions.items():
            # Check main condition name
            if condition_name.lower() in text.lower():
                score = len(condition_name) / len(text)
                if score > best_score:
                    best_score = score
                    best_condition = (condition_name, condition_info)
            
            # Check aliases
            for alias in condition_info.get("aliases", []):
                if alias.lower() in text.lower():
                    score = len(alias) / len(text)
                    if score > best_score:
                        best_score = score
                        best_condition = (condition_name, condition_info)
        
        # If found a good match
        if best_condition and best_score > 0.3:
            condition_name, condition_info = best_condition
            
            # Look for numeric values near this condition
            # First check if we already have extracted numeric values
            numeric_value = None
            comparison = "="
            
            # Use regex to find numeric values
            num_matches = re.finditer(r'(\d+(?:\.\d+)?)', text)
            for match in num_matches:
                numeric_value = float(match.group(0))
                
                # Look for comparison operators nearby
                pre_text = text[:match.start()].lower()
                post_text = text[match.end():].lower()
                
                # Check for comparison indicators
                if any(term in pre_text[-20:] for term in ["more than", "greater than", "above", "over", "at least"]):
                    comparison = ">"
                elif any(term in pre_text[-20:] for term in ["less than", "fewer than", "under", "below", "at most"]):
                    comparison = "<"
                elif any(term in pre_text[-20:] for term in ["exactly", "equal to", "equal", "equals"]):
                    comparison = "="
                
                break  # Just use the first numeric value found
            
            # Create the condition
            condition = Condition(
                text=condition_name,
                type=condition_info.get("type", "unknown"),
                value=numeric_value if numeric_value is not None else 0.0,
                comparison_type=comparison
            )
            
            # Add to parsed factor
            parsed.conditions.append(condition)
            logger.info(f"Extracted single condition: {condition_name} with value {numeric_value} and comparison {comparison}")
        
        # If still no condition found, try semantic matching
        if not parsed.conditions:
            doc = self.nlp(text) if self.nlp else None
            if doc:
                for token in doc:
                    if token.pos_ in ["NOUN", "VERB"] and len(token.text) > 2:
                        best_match, score = self._semantic_match(token.text, [c for c in self.conditions.keys()])
                        if score > 0.75:
                            condition_info = self.conditions.get(best_match, {})
                            
                            # Look for numeric values
                            numeric_value = None
                            for num_token in doc:
                                if num_token.like_num and num_token.i > token.i - 5 and num_token.i < token.i + 5:
                                    numeric_value = float(num_token.text) if num_token.text.replace('.', '', 1).isdigit() else None
                                    break
                            
                            # Create the condition
                            condition = Condition(
                                text=best_match,
                                type=condition_info.get("type", "unknown"),
                                value=numeric_value if numeric_value is not None else 0.0
                            )
                            
                            # Add to parsed factor
                            parsed.conditions.append(condition)
                            logger.info(f"Extracted condition via semantic match: {best_match}")
                            break
    
    def _semantic_match(self, text: str, candidates: List[str]) -> Tuple[str, float]:
        """Match text to the most semantically similar candidate"""
        if not candidates:
            return "", 0.0
            
        best_match = ""
        best_score = 0.0
        
        # Use sentence transformer for semantic matching if available
        if hasattr(self, 'entity_linker') and self.entity_linker.sentence_model:
            try:
                text_embedding = self.entity_linker.sentence_model.encode(text.lower())
                
                for candidate in candidates:
                    candidate_embedding = self.entity_linker.sentence_model.encode(candidate.lower())
                    similarity = 1 - cosine(text_embedding, candidate_embedding)
                    
                    if similarity > best_score:
                        best_score = similarity
                        best_match = candidate
                
                return best_match, best_score
            except Exception as e:
                logger.error(f"Error in semantic matching with transformer: {str(e)}")
        
        # Use spaCy for semantic matching if available
        if self.nlp:
            try:
                text_vec = self.nlp(text).vector
                
                for candidate in candidates:
                    candidate_vec = self.nlp(candidate).vector
                    similarity = np.dot(text_vec, candidate_vec) / (np.linalg.norm(text_vec) * np.linalg.norm(candidate_vec))
                    
                    if similarity > best_score:
                        best_score = similarity
                        best_match = candidate
                
                return best_match, best_score
            except Exception as e:
                logger.error(f"Error in semantic matching with spaCy: {str(e)}")
        
        # Fallback to simpler matching
        for candidate in candidates:
            # Calculate Levenshtein distance for approximate matching
            max_len = max(len(text), len(candidate))
            if max_len == 0:
                score = 0
            else:
                distance = self._levenshtein_distance(text.lower(), candidate.lower())
                score = 1.0 - (distance / max_len)
            
            if score > best_score:
                best_score = score
                best_match = candidate
        
        return best_match, best_score
        
    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate the Levenshtein distance between two strings"""
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)
            
        if len(s2) == 0:
            return len(s1)
            
        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row
            
        return previous_row[-1]
    
    def _classify_factor_type(self, parsed: ParsedFactor):
        """Classify the factor type based on extracted information with enhanced logic"""
        # If no conditions, can't classify well
        if not parsed.conditions:
            if parsed.entity_type == "player":
                parsed.factor_type = "player_performance"
            elif parsed.entity_type == "team":
                parsed.factor_type = "team_performance"
            else:
                parsed.factor_type = "general"
            return
        
        # Get the main condition for classification
        main_condition = parsed.conditions[0]
        condition_type = main_condition.type
        
        # Determine factor type based on entity type and condition
        if parsed.entity_type == "player":
            if condition_type == "scoring":
                parsed.factor_type = "player_scoring"
            elif condition_type == "stat":
                parsed.factor_type = "player_statistics"
            elif condition_type == "achievement":
                parsed.factor_type = "player_achievement"
            else:
                parsed.factor_type = "player_performance"
                
        elif parsed.entity_type == "team":
            if condition_type == "outcome":
                parsed.factor_type = "team_result"
            elif condition_type == "margin":
                parsed.factor_type = "team_margin"
            elif condition_type == "totals":
                parsed.factor_type = "game_total"
            elif condition_type == "event":
                parsed.factor_type = "game_event"
            else:
                parsed.factor_type = "team_performance"
                
        else:
            # For unclear entity types, use condition
            if condition_type == "totals":
                parsed.factor_type = "game_total"
            elif condition_type == "outcome":
                parsed.factor_type = "game_outcome"
            elif condition_type == "event":
                parsed.factor_type = "game_event"
            else:
                parsed.factor_type = "general"
        
        logger.info(f"Classified factor as: {parsed.factor_type}")
    
    def _calculate_confidence(self, parsed: ParsedFactor) -> float:
        """Calculate confidence score for the parsing with enhanced logic"""
        # Start with base confidence
        confidence = 0.5
        
        # Add confidence based on entity matches
        if parsed.team:
            confidence += 0.1
        if parsed.player:
            confidence += 0.1
        if parsed.league:
            confidence += 0.05
        
        # Add confidence for conditions
        if parsed.conditions:
            # Add base confidence for having conditions
            condition_confidence = 0.15
            
            # Add extra for each well-formed condition
            for condition in parsed.conditions:
                if condition.text and condition.text != "unknown":
                    condition_confidence += 0.02
                if condition.value > 0:
                    condition_confidence += 0.02
                if condition.comparison_type != "=":
                    condition_confidence += 0.01
                if condition.time_frame:
                    condition_confidence += 0.01
            
            # Cap condition confidence
            confidence += min(0.25, condition_confidence)
        
        # Add confidence for compound conditions being correctly parsed
        if parsed.condition_operator != "NONE" and len(parsed.conditions) > 1:
            confidence += 0.05
        
        # Reduce confidence if using fallback methods
        if not self.nlp or not self.ner_model:
            confidence *= 0.85
        
        # Cap at 0.95 to leave room for uncertainty
        return min(confidence, 0.95)
    
    def parse_multi_factors(self, factors: List[str]) -> List[ParsedFactor]:
        """Parse multiple factors with enhanced support for batch processing"""
        results = []
        
        for factor in factors:
            parsed = self.parse_factor(factor)
            results.append(parsed)
        
        # Look for relationships between factors
        self._analyze_factor_relationships(results)
        
        return results
    
    def _analyze_factor_relationships(self, factors: List[ParsedFactor]):
        """Analyze relationships between multiple parsed factors"""
        # Skip if only one factor
        if len(factors) <= 1:
            return
        
        # Look for common entities across factors
        entities = defaultdict(list)
        
        for i, factor in enumerate(factors):
            if factor.player:
                entities["player:" + factor.player].append(i)
            if factor.team:
                entities["team:" + factor.team].append(i)
            if factor.league:
                entities["league:" + factor.league].append(i)
        
        # For factors that share entities, boost confidence slightly
        for entity_factors in entities.values():
            if len(entity_factors) > 1:
                for idx in entity_factors:
                    factors[idx].confidence = min(0.95, factors[idx].confidence + 0.02)
    
    def get_all_entities(self) -> Dict:
        """Get all known entities for reference"""
        return {
            "leagues": self.leagues,
            "teams": self.teams,
            "players": self.players,
            "conditions": self.conditions,
            "tournaments": self.tournaments if hasattr(self, 'tournaments') else {},
            "stadiums": self.stadiums if hasattr(self, 'stadiums') else {}
        }

    async def validate_factor(self, parsed_factor: ParsedFactor) -> Tuple[bool, str]:
        """Validate if the parsed factor is valid and has sufficient data"""
        try:
            # Check if we have enough information to make a prediction
            if not parsed_factor.entity_type or parsed_factor.entity_type == "unknown":
                return False, "Could not determine if this is about a player, team, or match"
            
            if parsed_factor.entity_type == "player" and not parsed_factor.player:
                return False, "Could not identify a specific player"
                
            if parsed_factor.entity_type == "team" and not parsed_factor.team:
                return False, "Could not identify a specific team"
            
            if not parsed_factor.conditions:
                return False, "Could not identify what condition(s) to predict"
            
            # Validate each condition
            invalid_conditions = []
            for condition in parsed_factor.conditions:
                if not condition.text or condition.text == "unknown":
                    invalid_conditions.append("Unknown condition type")
                
                # For conditions that require numeric values
                if condition.type in ["scoring", "stat", "margin"] and condition.value == 0:
                    invalid_conditions.append(f"Missing value for condition: {condition.text}")
            
            if invalid_conditions:
                return False, f"Invalid conditions: {', '.join(invalid_conditions)}"
            
            # Factor is valid
            return True, "Valid factor"
            
        except Exception as e:
            logger.error(f"Error validating factor: {str(e)}")
            return False, f"Error validating factor: {str(e)}"
    
    def predict_sport_from_factor(self, parsed_factor: ParsedFactor) -> str:
        """Predict the sport based on the parsed factor"""
        # Start with unknown
        sport = "unknown"
        
        # Check conditions for sport-specific ones
        for condition in parsed_factor.conditions:
            condition_info = self.conditions.get(condition.text, {})
            if "sport" in condition_info and condition_info["sport"] != "all":
                sport = condition_info["sport"]
                break
        
        # If still unknown, check player's team league
        if sport == "unknown" and parsed_factor.player:
            for player_key, player_info in self.players.items():
                if player_info["name"] == parsed_factor.player:
                    if "league" in player_info:
                        league_id = player_info["league"]
                        for league_key, league_info in self.leagues.items():
                            if league_info["id"] == league_id:
                                sport = league_info["type"]
                                break
                    break
        
        # If still unknown, check team's league
        if sport == "unknown" and parsed_factor.team:
            for team_key, team_info in self.teams.items():
                if team_info["name"] == parsed_factor.team:
                    if "league" in team_info:
                        league_id = team_info["league"]
                        for league_key, league_info in self.leagues.items():
                            if league_info["id"] == league_id:
                                sport = league_info["type"]
                                break
                    break
        
        return sport
    
    def get_condition_details(self, condition_name: str) -> Dict:
        """Get detailed information about a specific condition"""
        return self.conditions.get(condition_name, {})
    
    def enhance_parsed_factor(self, parsed_factor: ParsedFactor) -> ParsedFactor:
        """Add additional context and information to an already parsed factor"""
        # Add known relationships
        if parsed_factor.player and not parsed_factor.team:
            # Look up player's team
            for player_key, player_info in self.players.items():
                if player_info["name"] == parsed_factor.player:
                    if "team" in player_info:
                        for team_key, team_info in self.teams.items():
                            if team_info["id"] == player_info["team"]:
                                parsed.team = team_info["name"]
                                break
                    break
        
        # Predict sport if not already known
        sport = self.predict_sport_from_factor(parsed_factor)
        
        # Enhance conditions with sport-specific info
        for condition in parsed_factor.conditions:
            # Set default type based on sport
            if condition.type == "unknown" and sport != "unknown":
                if condition.text in self.conditions:
                    condition_info = self.conditions[condition.text]
                    if condition_info.get("sport") == sport or condition_info.get("sport") == "all":
                        condition.type = condition_info.get("type", "unknown")
        
        # Recalculate confidence
        parsed_factor.confidence = self._calculate_confidence(parsed_factor)
        
        return parsed_factor
    
    def explain_factor(self, parsed_factor: ParsedFactor) -> str:
        """Generate a natural language explanation of the parsed factor"""
        explanation = []
        
        # Entity explanation
        if parsed_factor.entity_type == "player":
            explanation.append(f"This prediction is about player {parsed_factor.player}")
            if parsed_factor.team:
                explanation.append(f" who plays for {parsed_factor.team}")
        elif parsed_factor.entity_type == "team":
            explanation.append(f"This prediction is about team {parsed_factor.team}")
        
        # League context
        if parsed_factor.league:
            explanation.append(f" in the {parsed_factor.league}")
        
        explanation.append(".")
        
        # Condition explanation
        if parsed_factor.conditions:
            if len(parsed_factor.conditions) == 1:
                condition = parsed_factor.conditions[0]
                explanation.append(f" The prediction involves {condition.text}")
                
                if condition.value > 0:
                    if condition.comparison_type == ">":
                        explanation.append(f" greater than {condition.value}")
                    elif condition.comparison_type == "<":
                        explanation.append(f" less than {condition.value}")
                    elif condition.comparison_type == ">=":
                        explanation.append(f" at least {condition.value}")
                    elif condition.comparison_type == "<=":
                        explanation.append(f" at most {condition.value}")
                    else:
                        explanation.append(f" exactly {condition.value}")
                
                if condition.time_frame:
                    if condition.time_position:
                        explanation.append(f" in the {condition.time_position} {condition.time_frame}")
                    else:
                        explanation.append(f" in the {condition.time_frame}")
            else:
                explanation.append(" The prediction involves multiple conditions:")
                
                for i, condition in enumerate(parsed_factor.conditions):
                    explanation.append(f"\n{i+1}. {condition.text}")
                    
                    if condition.value > 0:
                        if condition.comparison_type == ">":
                            explanation.append(f" greater than {condition.value}")
                        elif condition.comparison_type == "<":
                            explanation.append(f" less than {condition.value}")
                        elif condition.comparison_type == ">=":
                            explanation.append(f" at least {condition.value}")
                        elif condition.comparison_type == "<=":
                            explanation.append(f" at most {condition.value}")
                        else:
                            explanation.append(f" exactly {condition.value}")
                    
                    if condition.time_frame:
                        if condition.time_position:
                            explanation.append(f" in the {condition.time_position} {condition.time_frame}")
                        else:
                            explanation.append(f" in the {condition.time_frame}")
                
                if parsed_factor.condition_operator != "NONE":
                    explanation.append(f"\nThese conditions are combined with a {parsed_factor.condition_operator} operator.")
        
        # Confidence
        explanation.append(f"\nThe parser is {parsed_factor.confidence*100:.1f}% confident in this interpretation.")
        
        return ''.join(explanation)

# Singleton instance for reuse
_parser_instance = None

def get_parser():
    """Get or create the factor parser instance"""
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = FactorParser()
    return _parser_instance

def parse_factor(text: str) -> ParsedFactor:
    """Convenience function to parse a single factor"""
    parser = get_parser()
    return parser.parse_factor(text)

def batch_parse_factors(factors: List[str]) -> List[ParsedFactor]:
    """Convenience function to parse multiple factors"""
    parser = get_parser()
    return parser.parse_multi_factors(factors)

if __name__ == "__main__":
    # Test the enhanced factor parser
    parser = FactorParser()
    
    test_factors = [
        "LeBron James scores more than 25 points",
        "Chiefs win by at least 7 points",
        "Yankees hit 3 home runs",
        "Liverpool wins and Mohamed Salah scores",
        "LeBron scores more than 25 points and gets at least 8 rebounds",
        "Chiefs don't lose by more than 7 points in the second half",
        "Giannis gets a triple double with at least 10 assists",
        "Lakers win while LeBron gets a double-double",
        "Mahomes throws for 300+ yards but Chiefs still lose",
        "Curry makes at least 5 threes in the first half"
    ]
    
    print("Testing Enhanced Factor Parser")
    print("=" * 50)
    
    for factor in test_factors:
        print(f"Factor: {factor}")
        parsed = parser.parse_factor(factor)
        print(f"Parsed: {json.dumps(parsed.to_dict(), indent=2)}")
        print(f"Explanation: {parser.explain_factor(parsed)}")
        print("-" * 50)
