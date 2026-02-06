/**
 * Utility script to remove duplicate AI servers from the database
 * Run this in the browser console on your app page
 */

import { supabase } from './src/lib/supabase';

async function removeDuplicateServers() {
    console.log('Checking for duplicate AI servers...');

    // Get all servers
    const { data: servers, error } = await supabase
        .from('ai_servers')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching servers:', error);
        return;
    }

    if (!servers || servers.length === 0) {
        console.log('No servers found.');
        return;
    }

    // Find duplicates based on IP address and port
    const seen = new Map();
    const duplicates = [];

    for (const server of servers) {
        const key = `${server.ip_address}:${server.port}`;
        if (seen.has(key)) {
            // This is a duplicate - keep the older one (first occurrence)
            duplicates.push(server);
            console.log(`Found duplicate: ${server.name} (${key}) - ID: ${server.id}`);
        } else {
            seen.set(key, server);
        }
    }

    if (duplicates.length === 0) {
        console.log('No duplicates found!');
        return;
    }

    console.log(`Found ${duplicates.length} duplicate server(s). Removing...`);

    // Remove duplicates
    for (const dup of duplicates) {
        const { error: deleteError } = await supabase
            .from('ai_servers')
            .delete()
            .eq('id', dup.id);

        if (deleteError) {
            console.error(`Error deleting ${dup.name}:`, deleteError);
        } else {
            console.log(`✓ Removed duplicate: ${dup.name} (${dup.ip_address}:${dup.port})`);
        }
    }

    console.log('Done! Refresh the page to see updated list.');
}

// Run the function
removeDuplicateServers();
