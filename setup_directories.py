import os
import shutil

# Base directories
base_dir = os.path.dirname(os.path.abspath(__file__))
img_dir = os.path.join(base_dir, 'public', 'img')
teams_dir = os.path.join(img_dir, 'teams')
leagues_dir = os.path.join(img_dir, 'leagues')

# Create necessary directories
directories = [
    os.path.join(teams_dir, 'nba'),
    os.path.join(teams_dir, 'nfl'),
    os.path.join(teams_dir, 'mlb'),
    os.path.join(teams_dir, 'nhl'),
    leagues_dir
]

# Ensure directories exist
for directory in directories:
    os.makedirs(directory, exist_ok=True)
    print(f"Created directory: {directory}")

# Teams for which we need placeholders
nba_teams = ['lakers', 'warriors', 'celtics', 'bucks', 'heat', 'nets']
leagues = ['bundesliga', 'serie-a']

# Copy placeholder.svg to team directories
placeholder_path = os.path.join(img_dir, 'placeholder.svg')
league_placeholder_path = os.path.join(leagues_dir, 'league-placeholder.svg')

if os.path.exists(placeholder_path):
    # Copy for NBA teams
    for team in nba_teams:
        dest = os.path.join(teams_dir, 'nba', f"{team}.svg")
        if not os.path.exists(dest):
            shutil.copy(placeholder_path, dest)
            print(f"Created placeholder for: {team}")

    # Copy for leagues
    for league in leagues:
        dest = os.path.join(leagues_dir, f"{league}.svg")
        if not os.path.exists(dest):
            if os.path.exists(league_placeholder_path):
                shutil.copy(league_placeholder_path, dest)
            else:
                shutil.copy(placeholder_path, dest)
            print(f"Created placeholder for league: {league}")

print("Setup complete! Your directories are ready.") 