---------------- MODULE Research ----------------
EXTENDS Naturals
VARIABLES phase, evidence, corrections, budget
vars == <<phase, evidence, corrections, budget>>
Init == /\ phase = "Checking" /\ evidence = FALSE /\ corrections = 0 /\ budget = "unknown"
NeedInput == /\ phase = "Checking" /\ phase' = "NeedsInput" /\ UNCHANGED <<evidence, corrections, budget>>
Start == /\ phase = "Checking" /\ phase' = "Searching" /\ UNCHANGED <<evidence, corrections, budget>>
NoResults == /\ phase = "Searching" /\ phase' = "Failed" /\ UNCHANGED <<evidence, corrections, budget>>
Found == /\ phase = "Searching" /\ phase' = "Ranking" /\ evidence' = TRUE /\ UNCHANGED <<corrections, budget>>
Valid == /\ phase = "Ranking" /\ phase' = "Partial" /\ UNCHANGED <<evidence, corrections, budget>>
Correct == /\ phase = "Ranking" /\ corrections = 0 /\ phase' = "Correcting" /\ corrections' = 1 /\ UNCHANGED <<evidence, budget>>
RetryValid == /\ phase = "Correcting" /\ phase' = "Partial" /\ UNCHANGED <<evidence, corrections, budget>>
RetryInvalid == /\ phase = "Correcting" /\ phase' = "EvidenceOnly" /\ UNCHANGED <<evidence, corrections, budget>>
FailBefore == /\ phase = "Searching" /\ phase' = "Failed" /\ UNCHANGED <<evidence, corrections, budget>>
FailAfter == /\ phase \in {"Ranking", "Correcting"} /\ phase' = "EvidenceOnly" /\ UNCHANGED <<evidence, corrections, budget>>
Cancel == /\ phase \in {"Searching", "Ranking", "Correcting"} /\ phase' = "Canceled" /\ UNCHANGED <<evidence, corrections, budget>>
Done == /\ phase \in {"NeedsInput", "Failed", "Partial", "EvidenceOnly", "Canceled"} /\ UNCHANGED vars
Next == NeedInput \/ Start \/ NoResults \/ Found \/ Valid \/ Correct \/ RetryValid \/ RetryInvalid \/ FailBefore \/ FailAfter \/ Cancel \/ Done
Spec == Init /\ [][Next]_vars
EvidenceRequired == phase \in {"Ranking", "Correcting", "Partial", "EvidenceOnly"} => evidence
OneCorrection == corrections <= 1
BudgetUnknown == budget = "unknown"
=================================================
