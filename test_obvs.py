from main import record_observation

print("A observes in_stock=True :", record_observation(1, True))   # expect True  (false->true, A wins)
print("B observes in_stock=True :", record_observation(1, True))   # expect False (already true, dupe suppressed)
print("sold out (False)        :", record_observation(1, False))   # expect False (re-arm, never alerts)
print("restock again (True)    :", record_observation(1, True))    # expect True  (false->true again, Friday case)