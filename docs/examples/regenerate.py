#!/usr/bin/env python

import argparse
import json
import os
import re
import requests
import subprocess

def main():
    parser = argparse.ArgumentParser(description='Regenerates example list HTML and/or take screenshots')
    parser.add_argument('--stdout', action='store_true', help='Dump HTML to STDOUT')
    parser.add_argument('--local', action='store_true', help='Do not make HTTP requests')
    parser.add_argument('--screenshots', action='store_true', help='Take screenshots of every example')
    args = parser.parse_args()
    if not (args.stdout or args.screenshots):
        parser.print_help()
    else:
        dir = os.path.dirname(os.path.realpath(__file__))

        api_html = get_api_html(dir)
        local_vc_list = get_local_vc_list(dir)
        remote_vc_list = get_remote_vc_list(args.local)
        
        if args.screenshots:
            screenshots([vc['href'] for vc in local_vc_list + remote_vc_list])
        
        all_track_types = tracktypes_from_vc_list(local_vc_list + remote_vc_list)

        print(template(api_html, all_track_types, local_vc_list, remote_vc_list))

def screenshots(hrefs):
    for href in hrefs:
        filename = re.sub(r'.*[/=]', '', href)
        subprocess.run([
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '--headless', '--disable-gpu', '--hide-scrollbars',
                '--screenshot=/tmp/screenshots/{}.png'.format(filename),
                '--virtual-time-budget=2000',
                '--window-size=500,1000',
                'http://localhost:8080/apis/svg.html?' + href
            ],
            check=True
        )

def get_api_html(dir):
    api_examples = os.listdir(os.path.join(dir, 'apis'))
    return '\n'.join(['<a href="apis/{0}">{0}</a><br>'.format(file) for file in api_examples])

def get_local_vc_list(dir):
    local_vc_files = os.listdir(os.path.join(dir, 'viewconfs'))
    local_vc_list = []
    for filename in local_vc_files:
        with open(os.path.join(dir, 'viewconfs', filename)) as f:
            local_vc_list.append({
                'href': '/viewconfs/{}'.format(filename),
                'title': filename,
                'viewconf': f.read()
            })
    return local_vc_list
    
def get_remote_vc_list(skip):
    if skip:
        return []
    gist_url = 'https://gist.githubusercontent.com/pkerpedjiev/104f6c37fbfd0d7d41c73a06010a3b7e/raw/4e65ed9bf8bb1bb24ecaea088bba2d718a18c233'
    remote_vc_examples = requests.get(gist_url).json()
    remote_vc_list = []
    for example in remote_vc_examples:
        url = example['url'].replace('/app/?config=', '/api/v1/viewconfs/?d=')
        viewconf = requests.get(url).text
        remote_vc_list.append({
            'href': url,
            'title': example['title'],
            'viewconf': viewconf
        })
    return remote_vc_list
    
def tracktypes_from_vc_list(vc_list):
    tracktypes = [track_types(vc['viewconf']) for vc in vc_list]
    return sorted(set.union(*tracktypes))
    
def template(api_html, all_track_types, local_vc_list, remote_vc_list):
    # https://css-tricks.com/rotated-table-column-headers/
    css = '''
    th {
      height: 140px;
      white-space: nowrap;
    }
    th > div {
      transform: 
        translate(0px, 51px)
        rotate(-45deg);
      width: 30px;
    }
    tr:hover {
      background-color: lightgrey;
    }
    '''
    return '''
    <html>
    <head><style>{}</style></head>
    <body>
    <h2>API examples</h2>
    {}

    <h2>Viewconf examples</h2>
    <table>
    {}
    <tr><td>local</td></tr>
    {}
    <tr><td>higlass.io</td></tr>
    {}
    </table>

    </body>
    </html>
    '''.format(
        css,
        api_html, tracktypes_header_html(all_track_types),
        list_to_html(local_vc_list, all_track_types),
        list_to_html(remote_vc_list, all_track_types)
    )
    
def track_types(viewconf_string):
    return set(match[1] for match in re.finditer(r'"type": "([^"]+)"', viewconf_string))

def tracktypes_header_html(tracktypes):
    return '<tr><td></td>{}</tr>'.format(''.join([
        '<th><div>{}</div></th>'.format(t)
        for t in tracktypes
    ]))

def list_to_html(vc_list, all_track_types):
    return '\n'.join([
        '<tr><td><a href="apis/svg.html?{}">{}</a></td>{}</tr>'.format(
          info['href'], info['title'],
          ''.join(['<td>{}</td>'.format('X' if t in track_types(info['viewconf']) else '') for t in all_track_types])
        )
        for info in vc_list
    ])
    
if __name__ == '__main__':
    main()
