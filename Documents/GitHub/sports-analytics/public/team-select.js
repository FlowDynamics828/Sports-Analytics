
import React, { useState, useEffect } from 'react';

const TeamSelect = ({ selectedLeague, onTeamSelect }) => {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTeams = async () => {
            try {
                const response = await fetch(`/api/leagues/${selectedLeague}/teams`);
                if (!response.ok) {
                    throw new Error('Failed to fetch teams');
                }
                const data = await response.json();
                setTeams(data);
            } catch (error) {
                console.error('Error fetching teams:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTeams();
    }, [selectedLeague]);

    if (loading) {
        return (
            <select disabled className="bg-gray-700 text-white p-2 rounded opacity-50">
                <option>Loading teams...</option>
            </select>
        );
    }

    return (
        <select
            onChange={(e) => onTeamSelect(e.target.value)}
            className="bg-gray-700 text-white p-2 rounded hover:bg-gray-600 transition-colors"
        >
            <option value="">All Teams</option>
            {teams.map((team) => (
                <option key={team.id} value={team.id}>
                    {team.name}
                </option>
            ))}
        </select>
    );
};

export default TeamSelect;